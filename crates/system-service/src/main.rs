mod generated;
mod rpc;

use serde_json::Value;
use std::env;
use std::path::PathBuf;
use wanex_system_service::SystemServiceError;

fn main() {
    let args = match parse_args() {
        Ok(args) => args,
        Err(error) => {
            print_response(rpc::response_for_result(None, Err(error)).response);
            std::process::exit(1);
        }
    };

    if args.serve {
        if let Err(error) = rpc::run_serve(args.store_dir) {
            print_response(rpc::response_for_result(None, Err(error)).response);
            std::process::exit(1);
        }
        return;
    }

    let output = rpc::run_once(args.store_dir);
    print_response(output.response);
    if !output.ok {
        std::process::exit(1);
    }
}

struct CliArgs {
    store_dir: PathBuf,
    serve: bool,
}

fn parse_args() -> Result<CliArgs, SystemServiceError> {
    let mut args = env::args().skip(1);
    let mut store_dir: Option<PathBuf> = None;
    let mut serve = false;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--store" => {
                let Some(path) = args.next() else {
                    return Err(SystemServiceError::InvalidLogicalPath(
                        "missing value for --store".to_string(),
                    ));
                };
                store_dir = Some(PathBuf::from(path));
            }
            "--serve" => {
                serve = true;
            }
            _ => {
                return Err(SystemServiceError::InvalidLogicalPath(format!(
                    "unknown argument: {arg}"
                )));
            }
        }
    }
    let Some(store_dir) = store_dir else {
        return Err(SystemServiceError::InvalidLogicalPath(
            "usage: wanex-system-service --store <dir> [--serve]".to_string(),
        ));
    };
    Ok(CliArgs { store_dir, serve })
}

fn print_response(response: Value) {
    println!(
        "{}",
        serde_json::to_string(&response).expect("response should serialize")
    );
}
