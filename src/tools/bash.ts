import { exec } from "node:child_process";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const MAX_OUTPUT = 16_384; // 16KB

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + `\n... (${text.length - max} bytes truncated)`;
}

export const bashTool: AgentTool = {
	name: "bash",
	label: "Bash",
	description: "Execute a shell command and return stdout, stderr, and exit code.",
	parameters: Type.Object({
		command: Type.String({ description: "Shell command to execute" }),
		timeout: Type.Optional(
			Type.Number({ description: "Timeout in milliseconds (default 30000)" }),
		),
	}),
	execute: async (_toolCallId, params, signal) => {
		const { command, timeout = 30_000 } = params as {
			command: string;
			timeout?: number;
		};

		return new Promise((resolve, reject) => {
			const child = exec(command, { timeout, encoding: "utf-8" }, (error, stdout, stderr) => {
				const result = [];

				if (stdout) result.push(`STDOUT:\n${truncate(stdout, MAX_OUTPUT)}`);
				if (stderr) result.push(`STDERR:\n${truncate(stderr, MAX_OUTPUT)}`);
				if (error) result.push(`EXIT CODE: ${error.code ?? "unknown"}`);

				if (error && !stdout && !stderr) {
					reject(new Error(`Command failed (exit ${error.code}): ${error.message}`));
					return;
				}

				resolve({
					content: [
						{
							type: "text" as const,
							text: result.join("\n\n") || "Command completed with no output.",
						},
					],
					details: { exitCode: error?.code ?? 0 },
				});
			});

			signal?.addEventListener(
				"abort",
				() => {
					if (child.pid) {
						try {
							process.kill(-child.pid, "SIGTERM");
						} catch {
							child.kill("SIGTERM");
						}
					}
				},
				{ once: true },
			);
		});
	},
};
