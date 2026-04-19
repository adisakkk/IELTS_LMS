use sqlx::PgPool;

#[derive(Clone, Debug)]
pub struct DatabasePool {
    inner: Option<PgPool>,
}

impl DatabasePool {
    pub fn new(pool: PgPool) -> Self {
        Self { inner: Some(pool) }
    }

    pub fn placeholder() -> Self {
        Self { inner: None }
    }

    pub fn inner(&self) -> Option<&PgPool> {
        self.inner.as_ref()
    }

    pub fn readiness_label(&self) -> &'static str {
        match self.inner {
            Some(_) => "ready",
            None => "pending",
        }
    }
}
