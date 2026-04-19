#[tokio::main]
async fn main() -> std::io::Result<()> {
    ielts_backend_api::run().await
}
