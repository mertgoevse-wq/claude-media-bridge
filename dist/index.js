import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMediaServer } from "./server.js";
async function main() {
    const server = createMediaServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error("Fatal error starting claude-media-bridge:", err);
    process.exit(1);
});
