#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program
  .name("thoth")
  .description("T.H.O.T.H. local operations CLI")
  .version("0.1.0");

program
  .command("status")
  .description("Show workspace status")
  .action(() => {
    console.log("T.H.O.T.H. workspace status is not implemented yet.");
  });

program.parse();
