// Core definitions for the configuration system
"use strict";

const util = require("util");
const crypto = require("crypto");
const path = require("path");
const fs = console

const classes = require("./classes");


/**
 * Master config group for {@link module:lib/config.MasterConfig}
 * @extends module:lib/config.ConfigGroup
 * @memberof module:lib/config
 */
class MasterGroup extends classes.ConfigGroup { }
MasterGroup.groupName = "master";
MasterGroup.define({
	name: "database_directory",
	title: "Database directory",
	description: "Directory where item and configuration data is stored.",
	type: "string",
	initial_value: "database",
});
MasterGroup.define({
	name: "http_port",
	title: "HTTP Port",
	description: "Port to listen for HTTP connections on, set to null to not listen for HTTP connections.",
	type: "number",
	optional: true,
});
MasterGroup.define({
	name: "https_port",
	title: "HTTPS Port",
	description: "Port to listen for HTTPS connection on, set to null to not listen for HTTPS connections.",
	type: "number",
	optional: true,
	initial_value: 8443,
});
MasterGroup.define({
	name: "external_address",
	title: "External Address",
	description: "Public facing address the master server is hosted on.",
	type: "string",
	optional: true,
});
MasterGroup.define({
	name: "tls_certificate",
	title: "TLS Certificate",
	description: "Path to the certificate to use for HTTPS.",
	type: "string",
	optional: true,
	initial_value: "database/certificates/cert.crt",
});
MasterGroup.define({
	name: "tls_private_key",
	title: "TLS Private Key",
	description: "Path to the private key to use for HTTPS.",
	type: "string",
	optional: true,
	initial_value: "database/certificates/cert.key",
});
MasterGroup.define({
	name: "tls_bits",
	title: "TLS Bits",
	description: "Number of bits to use for auto generated TLS certificate.",
	type: "number",
	initial_value: 2048,
});
MasterGroup.define({
	name: "auth_secret",
	title: "Master Authentication Secret",
	description:
		"Secret used to generate and verify authentication tokens."
		+"  Should be a long string of random letters and numbers."
		+"  Do not share this.",
	type: "string",
	initial_value: async function() {
		console.log("Generating new master authentication secret");
		let asyncRandomBytes = util.promisify(crypto.randomBytes);
		let bytes = await asyncRandomBytes(256);
		return bytes.toString("base64");
	},
});
MasterGroup.define({
	name: "heartbeat_interval",
	title: "Heartbeat Interval",
	description: "Interval heartbeats are sent out on WebSocket connections",
	type: "number",
	initial_value: 60,
});
MasterGroup.define({
	name: "connector_shutdown_timeout",
	title: "Connector Shutdown Timeout",
	description: "Timeout in seconds for connectors to properly disconnect on shutdown",
	type: "number",
	initial_value: 30,
});
MasterGroup.define({
	name: "default_role_id",
	title: "Default role",
	description: "ID of role assigned by default to new users",
	type: "number",
	optional: true,
	initial_value: 1,
});
MasterGroup.finalize();

/**
 * Master Config class
 * @extends module:lib/config.Config
 * @memberof module:lib/config
 */
class MasterConfig extends classes.Config { }
MasterConfig.registerGroup(MasterGroup);


/**
 * Slave config group for {@link module:lib/config.SlaveConfig}
 * @extends module:lib/config.ConfigGroup
 * @memberof module:lib/config
 */
class SlaveGroup extends classes.ConfigGroup {}
SlaveGroup.groupName = "slave";
SlaveGroup.define({
	name: "name",
	description: "Name of the slave",
	type: "string",
	initial_value: "New Slave",
});
SlaveGroup.define({
	name: "id",
	description: "ID of the slave",
	type: "number",
	initial_value: () => Math.random() * 2**31 | 0,
});
SlaveGroup.define({
	name: "factorio_directory",
	description: "Path to directory to look for factorio installs",
	type: "string",
	initial_value: "factorio",
});
SlaveGroup.define({
	name: "instances_directory",
	description: "Path to directory to store instances in.",
	type: "string",
	initial_value: "instances",
});
SlaveGroup.define({
	name: "master_url",
	description: "URL to connect to the master server at",
	type: "string",
	initial_value: "https://localhost:8443/",
});
SlaveGroup.define({
	name: "master_token",
	description: "Token to authenticate to master server with.",
	type: "string",
	initial_value: "enter token here",
});
SlaveGroup.define({
	name: "public_address",
	description: "Public facing address players should connect to in order to join instances on this slave",
	type: "string",
	initial_value: "localhost",
});
SlaveGroup.define({
	name: "reconnect_delay",
	title: "Reconnect Delay",
	description: "Maximum delay to wait before attempting to reconnect WebSocket",
	type: "number",
	initial_value: 5,
});
SlaveGroup.finalize();

/**
 * Slave Config class
 * @extends module:lib/config.Config
 * @memberof module:lib/config
 */
class SlaveConfig extends classes.Config { }
SlaveConfig.registerGroup(SlaveGroup);


/**
 * Instance config group for {@link module:lib/config.InstanceConfig}
 * @extends module:lib/config.ConfigGroup
 * @memberof module:lib/config
 */
class InstanceGroup extends classes.ConfigGroup { }
InstanceGroup.groupName = "instance";
InstanceGroup.define({
	name: "name",
	type: "string",
	initial_value: "New Instance",
});
InstanceGroup.define({
	name: "id",
	description: "ID of the slave",
	type: "number",
	initial_value: () => Math.random() * 2**31 | 0,
});
InstanceGroup.define({
	name: "assigned_slave",
	type: "number",
	optional: true,
});
InstanceGroup.finalize();

/**
 * Factorio config group for {@link module:lib/config.InstanceConfig}
 * @extends module:lib/config.ConfigGroup
 * @memberof module:lib/config
 */
class FactorioGroup extends classes.ConfigGroup { }
FactorioGroup.groupName = "factorio";
FactorioGroup.define({
	name: "version",
	description: "Version of the game to run, use latest to run the latest installed version",
	type: "string",
	initial_value: "latest",
});
FactorioGroup.define({
	name: "game_port",
	description: "UDP port to run game on, uses a random port if null",
	type: "number",
	optional: true,
});
FactorioGroup.define({
	name: "rcon_port",
	description: "TCP port to run RCON on, uses a random port if null",
	type: "number",
	optional: true,
});
FactorioGroup.define({
	name: "rcon_password",
	description: "Password for RCON, randomly generated if null",
	type: "string",
	optional: true,
});
FactorioGroup.define({
	name: "enable_save_patching",
	description: "Patch saves with Lua code. Required for Clusterio integrations, lua modules, and most plugins.",
	type: "boolean",
	initial_value: true,
});
FactorioGroup.define({
	name: "settings",
	description: "Settings overridden in server-settings.json",
	type: "object",
	initial_value: {
		"tags": ["clusterio"],
		"auto_pause": false,
	},
});
FactorioGroup.finalize();

/**
 * Instance config class
 * @extends module:lib/config.Config
 * @memberof module:lib/config
 */
class InstanceConfig extends classes.Config { }
InstanceConfig.registerGroup(InstanceGroup);
InstanceConfig.registerGroup(FactorioGroup);


/**
 * Control config group for {@link module:lib/config.ControlConfig}
 * @extends module:lib/config.ConfigGroup
 * @memberof module:lib/config
 */
class ControlGroup extends classes.ConfigGroup {}
ControlGroup.groupName = "control";
ControlGroup.define({
	name: "master_url",
	description: "URL to connect to the master server at",
	type: "string",
	optional: true,
});
ControlGroup.define({
	name: "master_token",
	description: "Token to authenticate to master server with.",
	type: "string",
	optional: true,
});
ControlGroup.define({
	name: "reconnect_delay",
	title: "Reconnect Delay",
	description: "Maximum delay to wait before attempting to reconnect WebSocket",
	type: "number",
	initial_value: 2,
});
ControlGroup.finalize();

/**
 * Control config class
 * @extends module:lib/config.Config
 * @memberof module:lib/config
 */
class ControlConfig extends classes.Config { }
ControlConfig.registerGroup(ControlGroup);


function validateGroup(pluginInfo, groupName) {
	if (!pluginInfo[groupName] instanceof classes.PluginConfigGroup) {
		throw new Error(
			`Expected ${groupName} for ${pluginInfo.name} to be an instance of PluginConfigGroup`
		);
	}

	if (pluginInfo[groupName].groupName !== pluginInfo.name) {
		throw new Error(
			`Expected ${groupName} for ${pluginInfo.name} to be named after the plugin`
		);
	}
}

/**
 * Registers the config groups for the provided plugin infos
 *
 * @param {Array<Object>} pluginInfos - Array of plugin info objects.
 * @memberof module:lib/config
 */
function registerPluginConfigGroups(pluginInfos) {
	for (let pluginInfo of pluginInfos) {
		if (pluginInfo.MasterConfigGroup) {
			validateGroup(pluginInfo, "MasterConfigGroup");
			MasterConfig.registerGroup(pluginInfo.MasterConfigGroup);

		} else {
			class MasterConfigGroup extends classes.PluginConfigGroup { }
			MasterConfigGroup.groupName = pluginInfo.name;
			MasterConfigGroup.finalize();
			MasterConfig.registerGroup(MasterConfigGroup);
		}

		if (pluginInfo.instanceEntrypoint) {
			if (pluginInfo.InstanceConfigGroup) {
				validateGroup(pluginInfo, "InstanceConfigGroup");
				InstanceConfig.registerGroup(pluginInfo.InstanceConfigGroup);

			} else {
				class InstanceConfigGroup extends classes.PluginConfigGroup { }
				InstanceConfigGroup.groupName = pluginInfo.name;
				InstanceConfigGroup.finalize();
				InstanceConfig.registerGroup(InstanceConfigGroup);
			}
		}
	}
}

/**
 * Lock configs from adding more groups and make them usable
 *
 * @memberof module:lib/config
 */
function finalizeConfigs() {
	MasterConfig.finalize();
	SlaveConfig.finalize();
	InstanceConfig.finalize();
	ControlConfig.finalize();
}

/**
 * Yargs config command
 *
 * Can be passed to yargs.command to implement a config command.  Use
 * handleConfigCommand to do the requested action.
 *
 * @param {Object} yargs - yargs command builder.
 * @memberof module:lib/config
 */
function configCommand(yargs) {
	yargs
		.command("set <field> [value]", "Set config field")
		.command("show <field>", "Show value of the given config field")
		.command("list", "List all configuration fields and their values")
		.demandCommand(1, "You need to specify a command to run")
		.strict()
	;
}

/**
 * Handle yargs command
 *
 * Handle the actions that are made available by configCommand.
 *
 * @param {Object} args - yargs args object.
 * @param {module:lib/config.Config} instance - Config instance.
 * @param {string} configPath - Path to configuration file.
 * @memberof module:lib/config
 */
async function handleConfigCommand(args, instance, configPath) {
	let command = args._[1];

	if (command === "list") {
		for (let GroupClass of instance.constructor.groups.values()) {
			for (let def of GroupClass.definitions.values()) {
				let value = instance.get(def.fullName);
				console.log(`${def.fullName} ${JSON.stringify(value)}`);
			}
		}

	} else if (command === "show") {
		try {
			console.log(instance.get(args.field));
		} catch (err) {
			if (err instanceof classes.InvalidField) {
				console.error(err.message);
			} else {
				throw err;
			}
		}

	} else if (command === "set") {
		if (args.value === undefined) {
			args.value = null;
		}

		try {
			instance.set(args.field, args.value);
			await fs.outputFile(configPath, JSON.stringify(instance.serialize(), null, 4));
		} catch (err) {
			if (err instanceof classes.InvalidField || err instanceof classes.InvalidValue) {
				console.error(err.message);
			} else {
				throw err;
			}
		}
	}
}


export {
	MasterGroup,
	SlaveGroup,
	InstanceGroup,
	FactorioGroup,
	ControlGroup,

	MasterConfig,
	SlaveConfig,
	InstanceConfig,
	ControlConfig,

	registerPluginConfigGroups,
	finalizeConfigs,
	configCommand,
	handleConfigCommand,
};
