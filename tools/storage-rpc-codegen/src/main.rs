use schemars::schema::RootSchema;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use typify::{TypeSpace, TypeSpaceSettings};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args_os().skip(1);
    let schema_path = PathBuf::from(args.next().ok_or("missing schema path")?);
    let output_path = PathBuf::from(args.next().ok_or("missing output path")?);
    if args.next().is_some() {
        return Err("unexpected codegen argument".into());
    }

    let schema: RootSchema = serde_json::from_str(&fs::read_to_string(&schema_path)?)?;
    let mut settings = TypeSpaceSettings::default();
    settings.with_struct_builder(false);
    settings.with_replacement("JsonValue", "::serde_json::Value", [].into_iter());
    let mut type_space = TypeSpace::new(&settings);
    type_space.add_root_schema(schema)?;

    let generated = format!(
        "// Generated from schemas/storage-rpc/storage-rpc.schema.json. Do not edit.\n\n{}\n",
        type_space.to_stream()
    );
    fs::write(&output_path, generated)?;
    let status = Command::new("rustfmt").arg(&output_path).status()?;
    if !status.success() {
        return Err("rustfmt failed for generated storage RPC code".into());
    }
    Ok(())
}
