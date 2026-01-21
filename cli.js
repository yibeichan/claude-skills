#!/usr/bin/env node

/**
 * Claude Skills CLI
 * Install and manage Claude skills from this repository
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Load package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

// Load skills manifest
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));

// Default Claude Code skills directory
const DEFAULT_SKILLS_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.codex', 'skills');

function printHeader() {
  console.log(`\x1b[36mClaude Skills\x1b[0m v${packageJson.version}`);
  console.log(`Repository: ${packageJson.repository.url}\n`);
}

function listSkills() {
  printHeader();
  console.log('Available skills:\n');

  for (const skill of manifest.skills) {
    console.log(`\x1b[1;36m${skill.name}\x1b[0m`);
    console.log(`  Version: ${skill.version || '1.0.0'}`);
    console.log(`  Description: ${skill.description || 'No description'}`);
    console.log(`  Tags: ${skill.tags?.join(', ') || 'none'}`);
    console.log('');
  }
}

function copyDirectory(src, dest) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Copy all files and subdirectories
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function installSkill(skillName, options = {}) {
  const targetDir = options.target || DEFAULT_SKILLS_DIR;
  const overwrite = options.overwrite || false;

  // Find the skill
  const skill = manifest.skills.find(s => s.name === skillName);

  if (!skill) {
    console.error(`\x1b[31mError: Skill '${skillName}' not found.\x1b[0m`);
    console.log("Run 'npx claude-skills list' to see available skills.");
    return false;
  }

  // Source path
  const sourcePath = path.join(__dirname, skill.path);
  if (!fs.existsSync(sourcePath)) {
    console.error(`\x1b[31mError: Skill directory not found at ${sourcePath}\x1b[0m`);
    return false;
  }

  // Target path
  const targetPath = path.join(targetDir, skillName);

  // Check if already exists
  if (fs.existsSync(targetPath)) {
    if (!overwrite) {
      console.error(`\x1b[31mError: Target directory already exists: ${targetPath}\x1b[0m`);
      console.log("Use --overwrite to replace the existing skill.");
      return false;
    }
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  // Create target directory
  fs.mkdirSync(targetDir, { recursive: true });

  // Copy the skill
  console.log(`Installing ${skillName}...`);
  console.log(`  Source: ${sourcePath}`);
  console.log(`  Target: ${targetPath}`);

  copyDirectory(sourcePath, targetPath);

  console.log(`\x1b[32m✓ Successfully installed ${skillName}\x1b[0m\n`);
  return true;
}

function installAll(options = {}) {
  printHeader();
  console.log('Installing all skills...\n');

  let success = true;
  for (const skill of manifest.skills) {
    if (!installSkill(skill.name, options)) {
      success = false;
    }
  }

  return success;
}

function printHelp() {
  printHeader();
  console.log(`Usage: npx @yibeichen/claude-skills [command] [options]

Commands:
  list, ls              List all available skills
  install <skill>       Install a specific skill
  install-all           Install all skills

Options:
  --target, -t <dir>    Target directory for skills (default: ~/.codex/skills)
  --overwrite, -o       Overwrite existing skill directory
  --help, -h            Show this help message

Examples:
  npx @yibeichen/claude-skills list
  npx @yibeichen/claude-skills install bidsapp-nidm-standards
  npx @yibeichen/claude-skills install scientific-writer --target ./skills
  npx @yibeichen/claude-skills install-all --overwrite
  npx @yibeichen/claude-skills install bidsapp-nidm-standards -t ~/.claude/skills
`);
}

// Main CLI logic
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const options = {
    target: null,
    overwrite: false
  };

  // Parse options
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--target' || args[i] === '-t') {
      options.target = args[++i];
    } else if (args[i] === '--overwrite' || args[i] === '-o') {
      options.overwrite = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printHelp();
      return;
    }
  }

  switch (command) {
    case 'list':
    case 'ls':
      listSkills();
      break;

    case 'install':
      if (args[1] && !args[1].startsWith('-')) {
        installSkill(args[1], options);
      } else {
        console.error('\x1b[31mError: Please specify a skill name.\x1b[0m');
        console.log("Run 'npx @yibeichen/claude-skills list' to see available skills.");
      }
      break;

    case 'install-all':
      installAll(options);
      break;

    default:
      if (!command || command.startsWith('-')) {
        printHelp();
      } else {
        console.error(`\x1b[31mUnknown command: ${command}\x1b[0m`);
        printHelp();
      }
  }
}

main();
