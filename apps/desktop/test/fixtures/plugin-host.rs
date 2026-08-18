use std::env;
use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    if io::stdin().read_to_string(&mut input).is_err()
        || !input.contains("\"protocol\":\"wanex.plugin.host.v1\"")
        || !input.contains("\"type\":\"execute\"")
    {
        println!(
            "{{\"protocol\":\"wanex.plugin.host.v1\",\"type\":\"error\",\"error\":{{\"message\":\"unexpected request\"}}}}"
        );
        return;
    }

    let version = env::args().nth(1).unwrap_or_else(|| "unknown".to_string());
    println!(
        "{{\"protocol\":\"wanex.plugin.host.v1\",\"type\":\"result\",\"result\":{{\"fixture\":true,\"version\":\"{}\"}}}}",
        version
    );
}
