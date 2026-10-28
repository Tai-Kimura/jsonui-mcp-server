/** Real MCP stdio discovery/calls against a fake jui executable; never contacts a live agent. */
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, expect, it } from "vitest";
import { cleanupTempDirs, makeTempDir } from "./helpers.js";

afterEach(cleanupTempDirs);

it("discovers both tools over MCP and sends literal arguments with the caller's retry id", async () => {
  const home = realpathSync(makeTempDir("viz-stdio"));
  const bin = join(home, "bin");
  mkdirSync(bin);
  const record = join(home, "calls.jsonl");
  const marker = join(home, "must-not-exist");
  const fakeJui = join(bin, "jui");
  writeFileSync(fakeJui, `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.VIZ_TEST_RECORD, JSON.stringify({args, cwd: process.cwd()})+'\\n');
const get = key => args.find(a=>a.startsWith(key+'='))?.slice(key.length+1);
console.log(JSON.stringify(args[1] === 'peers'
  ? {sessions:[{id:'mcp-test-recipient',cli:'codex',provider:'lmstudio',available:true}]}
  : {ok:true,state:'sent',id:get('--id'),recipient:get('--to')}));
`);
  chmodSync(fakeJui, 0o755);
  const root = join(__dirname, "..");
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined));
  Object.assign(env, { HOME: home, JUI_PROJECT_DIR: home, JSONUI_CLI_PATH: join(home, "absent"),
    PATH: `${bin}:${dirname(process.execPath)}:${env.PATH ?? ""}`, VIZ_TEST_RECORD: record });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, "dist/index.js")], env, stderr: "pipe" });
  transport.stderr?.on("data", () => {});
  const client = new Client({name:"viz-message-test",version:"1"});
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(59);
    expect(tools.some(t=>t.name==="viz_peers")).toBe(true);
    const send = tools.find(t=>t.name==="viz_send_message")!;
    expect(send.inputSchema.required).toEqual(expect.arrayContaining(["recipient","text","message_id"]));
    const peers = await client.callTool({name:"viz_peers",arguments:{}});
    expect(peers.isError).toBe(false);
    const message = `--help\n$(touch ${marker}); \"quoted\" 日本語`;
    const result = await client.callTool({name:"viz_send_message",arguments:{
      sender:"mcp-test-sender",recipient:"--help",text:message,message_id:"stdio-retry-id"
    }});
    expect(result.isError).toBe(false);
    const text = (result.content as {type:string;text:string}[])[0].text;
    expect(JSON.parse(text)).toMatchObject({success:true,message_id:"stdio-retry-id",result:{id:"stdio-retry-id",state:"sent"}});
    const calls = readFileSync(record,"utf8").trim().split("\n").map(line=>JSON.parse(line));
    expect(calls).toEqual([
      {cwd:home,args:["viz","peers"]},
      {cwd:home,args:["viz","message","--to=--help",`--text=${message}`,"--id=stdio-retry-id","--from=mcp-test-sender"]}
    ]);
    expect(existsSync(marker)).toBe(false);
  } finally {
    await client.close();
  }
}, 30_000);
