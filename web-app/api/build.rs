use std::env;
use std::fs;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?);
    let proto_root = env::var("PROTO_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| manifest_dir.join("../../proto"));

    let tenant_proto = proto_root.join("tenant/v1/tenant.proto");
    let todo_proto = proto_root.join("todo/v1/todo.proto");

    println!("cargo:rerun-if-env-changed=PROTO_DIR");
    println!("cargo:rerun-if-changed={}", tenant_proto.display());
    println!("cargo:rerun-if-changed={}", todo_proto.display());

    let out_dir = PathBuf::from(env::var("OUT_DIR")?);
    let descriptor_path = out_dir.join("proto_descriptor.bin");

    let mut prost_config = prost_build::Config::new();
    prost_config
        .file_descriptor_set_path(&descriptor_path)
        .compile_well_known_types()
        .extern_path(".google.protobuf", "::pbjson_types");

    prost_config.compile_protos(&[&tenant_proto, &todo_proto], &[&proto_root])?;

    let descriptor_bytes = fs::read(&descriptor_path)?;
    pbjson_build::Builder::new()
        .register_descriptors(&descriptor_bytes)?
        .build(&[".tenant.v1", ".todo.v1"])?;

    Ok(())
}
