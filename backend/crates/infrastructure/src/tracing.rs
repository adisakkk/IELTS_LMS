use std::{error::Error, sync::OnceLock};

use opentelemetry::{trace::TracerProvider as _, KeyValue};
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::{runtime, trace::TracerProvider, Resource};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

type BoxError = Box<dyn Error + Send + Sync>;

static INIT: OnceLock<Result<(), String>> = OnceLock::new();
static TRACER_PROVIDER: OnceLock<TracerProvider> = OnceLock::new();

pub fn init_tracing(service_name: &str, otlp_endpoint: Option<&str>) -> Result<(), BoxError> {
    let result = INIT.get_or_init(|| {
        initialize_tracing(service_name, otlp_endpoint).map_err(|error| error.to_string())
    });

    match result {
        Ok(()) => Ok(()),
        Err(error) => Err(Box::new(std::io::Error::other(error.clone()))),
    }
}

pub fn shutdown_tracing() {
    if TRACER_PROVIDER.get().is_some() {
        opentelemetry::global::shutdown_tracer_provider();
    }
}

fn initialize_tracing(service_name: &str, otlp_endpoint: Option<&str>) -> Result<(), BoxError> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(false)
        .compact();

    if let Some(endpoint) = otlp_endpoint.filter(|value| !value.trim().is_empty()) {
        let provider = build_tracer_provider(service_name, endpoint)?;
        let tracer = provider.tracer(service_name.to_owned());
        opentelemetry::global::set_tracer_provider(provider.clone());
        let _ = TRACER_PROVIDER.set(provider);

        tracing_subscriber::registry()
            .with(filter)
            .with(fmt_layer)
            .with(tracing_opentelemetry::layer().with_tracer(tracer))
            .try_init()?;
    } else {
        tracing_subscriber::registry()
            .with(filter)
            .with(fmt_layer)
            .try_init()?;
    }

    Ok(())
}

fn build_tracer_provider(service_name: &str, endpoint: &str) -> Result<TracerProvider, BoxError> {
    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint(endpoint.to_owned())
        .build()?;
    let provider = TracerProvider::builder()
        .with_batch_exporter(exporter, runtime::Tokio)
        .with_resource(Resource::new([KeyValue::new(
            "service.name",
            service_name.to_owned(),
        )]))
        .build();

    Ok(provider)
}
