#! /usr/bin/env bun

import { program } from "commander";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { select, input } from "@inquirer/prompts";
import task from "tasuku";
import { $ } from "bun";
import chalk from "chalk";

// .goodgit.json file path
const goodgitFile = path.join(os.homedir(), ".goodgit.json");

program.version("1.0.0").description("My Node CLI");

// Get SSH files names from .ssh folder
const getSSHFiles = () => {
	// Get the .ssh folder
	const sshFolder = path.join(os.homedir(), ".ssh");

	// Read the files in the .ssh folder
	const files = fs.readdirSync(sshFolder);

	// Filter the files without .pub extension
	const sshFiles = files
		.filter((file) => !file.endsWith(".pub") && file.startsWith("id_"))
		.map((file) => file.replace("id_", ""));

	return sshFiles;
};

const addUserToSSHConfig = async (answer: {
	username: string;
	email: string;
	ssh_key: string;
}) => {
	const sshConfig = fs.readFileSync(
		path.join(os.homedir(), ".ssh", "config"),
		"utf-8",
	);

	const newSSHUser = (id: string) =>
		`\nHost ${id}.github.com\nHostName github.com\nIdentitiesOnly yes\nIdentityFile ~/.ssh/id_${id}\n`;

	const newSSHUserConfig = newSSHUser(answer.ssh_key);

	if (!sshConfig.includes(newSSHUserConfig)) {
		fs.appendFileSync(
			path.join(os.homedir(), ".ssh", "config"),
			newSSHUserConfig,
		);
	}
};

const removeUserFromSSHConfig = async (ssh_key: string) => {
	const sshConfig = fs.readFileSync(
		path.join(os.homedir(), ".ssh", "config"),
		"utf-8",
	);

	const SSHUser = (id: string) =>
		`Host ${id}.github.com\nHostName github.com\nIdentitiesOnly yes\nIdentityFile ~/.ssh/id_${id}`;

	const newSSHUserConfig = SSHUser(ssh_key);

	if (sshConfig.includes(newSSHUserConfig)) {
		fs.writeFileSync(
			path.join(os.homedir(), ".ssh", "config"),
			sshConfig.replace(newSSHUserConfig, ""),
		);
	}
};

// Command to add a new user
program
	.command("add")
	.description("Add a new user")
	.action(async () => {
		if (!fs.existsSync(goodgitFile)) {
			fs.writeFileSync(goodgitFile, JSON.stringify({}));
		}

		const goodgit = JSON.parse(fs.readFileSync(goodgitFile, "utf-8"));

		const users = getSSHFiles();

		if (users.length === 0) {
			chalk.red("No SSH keys found in the .ssh folder");
		}

		const answer = {
			username: await input({ message: "Enter your username" }),
			email: await input({ message: "Enter your email" }),
			ssh_key: await select<string>({
				message: "Select the SSH key",
				choices: users,
			}),
		};

		goodgit[answer.ssh_key] = answer;

		fs.writeFileSync(goodgitFile, JSON.stringify(goodgit, null, 2));
		addUserToSSHConfig(answer);
	});

// Command to list all users
program
	.command("list")
	.description("List all users")
	.alias("ls")
	.action(() => {
		const goodgit = JSON.parse(fs.readFileSync(goodgitFile, "utf-8"));

		console.table(goodgit);
	});

// Command to remove a user
program
	.command("remove")
	.description("Remove a user")
	.action(async () => {
		const goodgit = JSON.parse(fs.readFileSync(goodgitFile, "utf-8"));

		if (Object.keys(goodgit).length === 0) {
			chalk.red("No users found in the .goodgit file");
		}

		const answer = await select<string>({
			message: "Select the user to remove",
			choices: Object.keys(goodgit),
		});

		delete goodgit[answer];

		fs.writeFileSync(goodgitFile, JSON.stringify(goodgit, null, 2));
		removeUserFromSSHConfig(answer);
	});

// Command to clone a repository
program
	.command("clone")
	.argument("<repo>")
	.argument("[out]")
	.description("Clone a repository")
	.option("-o, --options <options>", "git clone options")
	.action(async (repo, out, options) => {
		const users = getSSHFiles();

		if (users.length === 0) {
			chalk.red("No SSH keys found in the .ssh folder");
		}

		const opts = `${options.options}`;

		const answer = await select<string>({
			message: "Select the user",
			choices: users,
		});

		const goodgit = JSON.parse(fs.readFileSync(goodgitFile, "utf-8"));

		const { username, email } = goodgit[answer];

		task("Cloning the repository", async ({ setTitle, setError }) => {
			setTitle(`Cloning the repository with user ${answer} `);

			try {
				// Clone the repository
				await $`git clone --config user.name = ${username} --config user.email = ${email} ${opts || ""} ${repo.replace("github.com", `${answer}.github.com`)} ${out || ""} `;

				setTitle("Repository cloned successfully");
			} catch (error) {
				if (error instanceof Error) {
					setError(error.message);
				}
			}
		});
	});

// Get git remote url from a repository dir
const getGitRemoteURL = async () => {
	const remoteURL = await $`git remote get-url origin`.nothrow().text();
	return remoteURL;
};

// Set git remote url in a repository dir
const setGitRemoteURL = async (url: string) => {
	const urlExists = await $`git remote get-url origin`.nothrow().text();
	if (!urlExists.length) {
		await $`git remote add origin ${url.replaceAll("\n", "")}`.quiet();
	} else {
		await $`git remote set-url origin ${url.replaceAll("\n", "")}`.quiet();
	}
};

// set user.name and user.email in the git config
const setGitUser = async (username: string, email: string) => {
	await $`git config --local user.name ${username}`.quiet();
	await $`git config --local user.email ${email}`.quiet();
};

// Command to set a user for the repository
program
	.command("set")
	.command("user")
	.description("Set a user for the repository")
	.action(async () => {
		let url = await getGitRemoteURL();

		if (url === "") {
			const answerURL = await input({ message: "Enter the repository URL" });
			url = answerURL;
		}

		const users = getSSHFiles();

		if (users.length === 0) {
			chalk.red("No SSH keys found in the .ssh folder");
		}

		const answer = await select<string>({
			message: "Select the user",
			choices: users,
		});

		if (!url.includes(`${answer}.github.com`)) {
			url = url.replace("github.com", `${answer}.github.com`);
			await setGitRemoteURL(url);
		}

		const goodgit = JSON.parse(fs.readFileSync(goodgitFile, "utf-8"));

		const { username, email } = goodgit[answer];

		await setGitUser(username, email);
	});

// Parsing the arguments
program.parse(process.argv);
