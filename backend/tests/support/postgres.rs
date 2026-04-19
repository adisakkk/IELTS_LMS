use std::{
    env, fs,
    path::{Path, PathBuf},
};

use chrono::{Duration, Utc};
use ielts_backend_domain::auth::{UserRole, UserState};
use ielts_backend_infrastructure::auth::{hash_password, random_token, sha256_hex};
use sqlx::{
    postgres::{PgConnectOptions, PgPoolOptions},
    Executor, PgPool,
};
use uuid::Uuid;

pub struct TestDatabase {
    current_user: String,
    db_name: String,
    pool: PgPool,
}

impl TestDatabase {
    pub async fn new(migrations: &[&str]) -> Self {
        let current_user = env::var("USER").unwrap_or_else(|_| "postgres".to_owned());
        let db_name = format!("codex_test_{}", Uuid::new_v4().simple());
        let admin_options = connect_options(&current_user, "postgres");
        let admin_pool = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(admin_options)
            .await
            .expect("connect to local postgres");

        admin_pool
            .execute(format!("create database {db_name}").as_str())
            .await
            .expect("create test database");

        let database_options = connect_options(&current_user, &db_name);
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(database_options)
            .await
            .expect("connect to test database");

        for migration in migrations {
            let sql = fs::read_to_string(migration_path(migration)).expect("read migration");
            pool.execute(sql.as_str()).await.expect("apply migration");
        }

        Self {
            current_user,
            db_name,
            pool,
        }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    #[allow(dead_code)]
    pub fn database_url(&self) -> String {
        format!(
            "postgresql://{}@localhost/{}?host=/tmp",
            self.current_user, self.db_name
        )
    }

    pub async fn shutdown(self) {
        let admin_options = connect_options(&self.current_user, "postgres");
        let admin_pool = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(admin_options)
            .await
            .expect("reconnect to local postgres");

        admin_pool
            .execute(format!("drop database if exists {} with (force)", self.db_name).as_str())
            .await
            .expect("drop test database");
    }
}

#[derive(Clone, Debug)]
pub struct TestAuthContext {
    pub user_id: Uuid,
    pub role: UserRole,
    pub email: String,
    pub display_name: String,
    pub session_token: String,
    pub csrf_token: String,
}

impl TestAuthContext {
    pub fn with_auth(
        &self,
        builder: axum::http::request::Builder,
    ) -> axum::http::request::Builder {
        builder.header("cookie", format!("__Host-session={}", self.session_token))
    }

    pub fn with_csrf(
        &self,
        builder: axum::http::request::Builder,
    ) -> axum::http::request::Builder {
        self.with_auth(builder).header("x-csrf-token", self.csrf_token.clone())
    }
}

pub async fn create_authenticated_user(
    pool: &PgPool,
    role: UserRole,
    email: &str,
    display_name: &str,
) -> TestAuthContext {
    let user_id = Uuid::new_v4();
    let session_token = random_token(32);
    let csrf_token = random_token(24);
    let password_hash = hash_password("Password123!").expect("hash password");
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO users (
            id, email, display_name, role, state, failed_login_count, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 0, $6, $6)
        "#,
    )
    .bind(user_id)
    .bind(email)
    .bind(display_name)
    .bind(role_sql(&role))
    .bind(state_sql(&UserState::Active))
    .bind(now)
    .execute(pool)
    .await
    .expect("insert user");

    sqlx::query(
        "INSERT INTO user_password_credentials (user_id, password_hash, updated_at) VALUES ($1, $2, $3)",
    )
    .bind(user_id)
    .bind(password_hash)
    .bind(now)
    .execute(pool)
    .await
    .expect("insert password credential");

    match role {
        UserRole::Student => {
            sqlx::query(
                r#"
                INSERT INTO student_profiles (user_id, student_id, full_name, email, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $5)
                "#,
            )
            .bind(user_id)
            .bind(email.split('@').next().unwrap_or("student"))
            .bind(display_name)
            .bind(email)
            .bind(now)
            .execute(pool)
            .await
            .expect("insert student profile");
        }
        _ => {
            sqlx::query(
                r#"
                INSERT INTO staff_profiles (user_id, full_name, email, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $4)
                "#,
            )
            .bind(user_id)
            .bind(display_name)
            .bind(email)
            .bind(now)
            .execute(pool)
            .await
            .expect("insert staff profile");
        }
    }

    sqlx::query(
        r#"
        INSERT INTO user_sessions (
            id, user_id, session_token_hash, csrf_token, role_snapshot, issued_at,
            last_seen_at, expires_at, idle_timeout_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(sha256_hex(&session_token))
    .bind(&csrf_token)
    .bind(role_sql(&role))
    .bind(now)
    .bind(now + Duration::hours(12))
    .bind(match role {
        UserRole::Student => now + Duration::minutes(60),
        _ => now + Duration::minutes(30),
    })
    .execute(pool)
    .await
    .expect("insert session");

    TestAuthContext {
        user_id,
        role,
        email: email.to_owned(),
        display_name: display_name.to_owned(),
        session_token,
        csrf_token,
    }
}

pub async fn assign_staff_to_schedule(
    pool: &PgPool,
    schedule_id: Uuid,
    user_id: Uuid,
    role: &str,
) {
    sqlx::query(
        r#"
        INSERT INTO schedule_staff_assignments (
            id, schedule_id, user_id, actor_id, role, granted_by, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $4, now())
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(schedule_id)
    .bind(user_id)
    .bind(user_id.to_string())
    .bind(role)
    .execute(pool)
    .await
    .expect("assign staff");
}

pub async fn bind_student_registration(
    pool: &PgPool,
    schedule_id: Uuid,
    student_key: &str,
    user_id: Uuid,
) {
    sqlx::query(
        r#"
        UPDATE schedule_registrations
        SET user_id = $3, actor_id = $3::text, updated_at = now()
        WHERE schedule_id = $1 AND student_key = $2
        "#,
    )
    .bind(schedule_id)
    .bind(student_key)
    .bind(user_id)
    .execute(pool)
    .await
    .expect("bind student registration");
}

pub async fn create_student_registration(
    pool: &PgPool,
    schedule_id: Uuid,
    user_id: Uuid,
    student_id: &str,
    student_name: &str,
    student_email: &str,
) -> String {
    let student_key = format!("student-{schedule_id}-{student_id}");
    sqlx::query(
        r#"
        INSERT INTO schedule_registrations (
            id, schedule_id, user_id, actor_id, student_key, student_id, student_name, student_email,
            access_state, created_at, updated_at
        )
        VALUES ($1, $2, $3, $3::text, $4, $5, $6, $7, 'checked_in', now(), now())
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(schedule_id)
    .bind(user_id)
    .bind(&student_key)
    .bind(student_id)
    .bind(student_name)
    .bind(student_email)
    .execute(pool)
    .await
    .expect("create student registration");
    student_key
}

fn role_sql(role: &UserRole) -> &'static str {
    match role {
        UserRole::Admin => "admin",
        UserRole::Builder => "builder",
        UserRole::Proctor => "proctor",
        UserRole::Grader => "grader",
        UserRole::Student => "student",
    }
}

fn state_sql(state: &UserState) -> &'static str {
    match state {
        UserState::Active => "active",
        UserState::Disabled => "disabled",
        UserState::Locked => "locked",
        UserState::PendingActivation => "pending_activation",
    }
}

fn connect_options(user: &str, database: &str) -> PgConnectOptions {
    PgConnectOptions::new()
        .host("/tmp")
        .username(user)
        .database(database)
}

fn migration_path(name: &str) -> PathBuf {
    backend_root().join("migrations").join(name)
}

fn backend_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("crate dir parent")
        .parent()
        .expect("backend root")
        .to_path_buf()
}
