// Message definitions for links
"use strict";
const schema = require("./../schema");
const errors = require("./../errors");

/**
 * Represents a message that can be sent over the link
 *
 * @memberof module:lib/link
 */
class Message {
	/**
	 * Name of the plugin this message belongs to, or null.
	 * @returns {?string} - plugin name or null if not from a plugin.
	 */
	get plugin() {
		if (this._plugin === undefined) {
			let index = this.type.indexOf(":");
			this._plugin = index === -1 ? null : this.type.slice(0, index);
		}

		return this._plugin;
	}
}

/**
 * Represents a request sent over the link
 *
 * A request-response message that can be innitated by either party of the
 * link.
 *
 * @extends module:lib/link.Message
 * @memberof module:lib/link
 */
class Request extends Message {

	/**
	 * Creates a request
	 *
	 * @param {string} type -
	 *     message type used.  Will have suffix '_request' for the request
	 *     message and suffix '_response' for the response message.
	 * @param {Array<string>} links -
	 *     Links this request is valid on.  Takes an array of strings
	 *     containing "<source>-<target>" specifications.
	 * @param {?string} permission -
	 *     Permission required to send this request.  Only applies to
	 *     requests sent from control to master.
	 * @param {?string} forwardTo -
	 *     Optional target to forward this request to.  'instance' add
	 *     instance_id into the requestProperties and forward to the given
	 *     instance.  'master' forwards it to the master server.
	 * @param {Object<string, Object>} requestProperties -
	 *     Mapping of property values to JSON schema specifications for the
	 *     properties that are valid in the data payload of this requst.
	 * @param {Object<string, Object>} responseProperties -
	 *     Mapping of property values to JSON schema specifications for the
	 *     properties that are valid in the data payload of the response to
	 *     this requst.
	 */
	constructor({
		type, permission, links, forwardTo = null, requestProperties = {}, responseProperties = {},
	}) {
		super();
		this.type = type;
		this.links = links;
		this.permission = permission || null;
		this.forwardTo = forwardTo;

		this.requestType = type + "_request";
		this.responseType = type + "_response";

		if (permission === undefined && links.includes("control-master")) {
			throw new Error(`permission is required for ${this.type} request over control-master links`);
		}
		if (permission && !links.includes("control-master")) {
			throw new Error(`permission is not allowed on ${this.type} request as it is not over control-master link`);
		}

		if (forwardTo === "instance") {
			requestProperties = {
				"instance_id": { type: "integer" },
				...requestProperties,
			};

		} else if (forwardTo !== "master" && forwardTo !== null) {
			throw new Error(`Invalid forwardTo value ${forwardTo}`);
		}

		this._requestValidator = schema.compile({
			$schema: "http://json-schema.org/draft-07/schema#",
			properties: {
				"type": { const: this.requestType },
				"data": {
					additionalProperties: false,
					required: Object.keys(requestProperties),
					properties: requestProperties,
				},
			},
		});

		this._responseValidator = schema.compile({
			$schema: "http://json-schema.org/draft-07/schema#",
			properties: {
				"type": { const: this.responseType },
				"data": {
					anyOf: [
						{
							additionalProperties: false,
							required: ["seq", ...Object.keys(responseProperties)],
							properties: {
								"seq": { type: "integer" },
								...responseProperties,
							},
						},
						{
							additionalProperties: false,
							required: ["seq", "error"],
							properties: {
								"seq": { type: "integer" },
								"error": { type: "string" },
							},
						},
					],
				},
			},
		});
	}

	/**
	 * Attach to a link
	 *
	 * Set a the validator for the response on the given link if it's a
	 * source and sets the handler for the request if it is a target.
	 *
	 * If forwardTo was set to 'instance' the `forwardRequestToInstance`
	 * method on the link is used as the default handler.
	 *
	 * If forwardTo was set to 'master' the `forwardRequesToMaster` method
	 * on the link is used as the default handler.
	 *
	 * Does nothing if the link is neither a source nor a target for this
	 * request.
	 *
	 * @param {Link} link - The link to attach to.
	 * @param {Function} handler -
	 *    Async function to invoke with link set as this to handle the
	 *    request request.  Only used on the target side.
	 * @throws {Error} if the handler is needed and not defined.
	 */
	attach(link, handler) {
		// Source side.
		if (this.links.includes(`${link.source}-${link.target}`)) {
			link.setValidator(this.responseType, this._responseValidator);
		}

		// Target side.  Note: Source and target is reversed here.
		if (this.links.includes(`${link.target}-${link.source}`)) {

			// Use forwarder if handler is not present.
			if (!handler) {
				if (this.forwardTo === "instance") {
					handler = link.forwardRequestToInstance;
				} else if (this.forwardTo === "master") {
					handler = link.forwardRequestToMaster;
				}
			}

			if (!handler) {
				throw new Error(`Missing handler for ${this.requestType} on ${link.source}-${link.target} link`);
			}

			// Check permission if this is a handler for a control connection on the master
			if (this.permission !== null && `${link.source}-${link.target}` === "master-control") {
				let origHandler = handler;
				handler = async function(message, request) {
					this.user.checkPermission(request.permission);
					return await origHandler.call(this, message, request);
				};
			}

			link.setHandler(this.requestType, message => {
				handler.call(link, message, this).then(response => {
					if (response === undefined) {
						// XXX Should we allow implicit responses like this?
						response = {};
					}

					if (!this._responseValidator({ seq: 0, type: this.responseType, response })) {
						console.error(this._responseValidator.errors);
						throw new Error(`Validation failed responding to ${this.requestType}`);
					}

					link.connector.send(this.responseType, { ...response, seq: message.seq });

				}).catch(err => {
					if (!(err instanceof errors.RequestError)) {
						console.error(`Unexpected error while responding to ${this.requestType}`, err);
					}
					link.connector.send(this.responseType, { seq: message.seq, error: err.message });
				});
			}, this._requestValidator);
		}
	}

	/**
	 * Send request over the given link
	 *
	 * Sends the given data over the link as the request payload and waits
	 * for the response.
	 *
	 * @param {module:lib/link.Link} link - Link to send request over.
	 * @param {Object} data - Data to send with the request.
	 * @returns {object} response data
	 */
	async send(link, data = {}) {
		// XXX validate link target/source?
		if (!this._requestValidator({ seq: 0, type: this.requestType, data })) {
			console.error(this._requestValidator.errors);
			throw new Error(`Validation failed sending ${this.requestType}`);
		}
		let seq = link.connector.send(this.requestType, data);
		let responseMessage = await link.waitFor(this.responseType, { seq });
		if (responseMessage.data.error) {
			throw new errors.RequestError(responseMessage.data.error);
		}
		return responseMessage.data;
	}
}


let messages = {};

// Connection requests
let wsLinks = ["master-control", "control-master", "master-slave", "slave-master"];
messages.prepareDisconnect = new Request({
	type: "prepare_disconnect",
	links: wsLinks,
	permission: null,
});

messages.prepareMasterDisconnect = new Request({
	type: "prepare_master_disconnect",
	links: ["slave-instance"],
});

messages.ping = new Request({
	type: "ping",
	links: wsLinks,
	permission: null,
});

messages.debugDumpWs = new Request({
	type: "debug_dump_ws",
	links: ["control-master"],
	permission: "core.debug.dump_ws",
});


// Management requests
messages.listSlaves = new Request({
	type: "list_slaves",
	links: ["control-master"],
	permission: "core.slave.list",
	responseProperties: {
		"list": {
			type: "array",
			items: {
				additionalProperties: false,
				required: ["agent", "version", "name", "id", "connected"],
				properties: {
					"agent": { type: "string" },
					"version": { type: "string" },
					"name": { type: "string" },
					"id": { type: "integer" },
					"connected": { type: "boolean" },
				},
			},
		},
	},
});

messages.listInstances = new Request({
	type: "list_instances",
	links: ["control-master"],
	permission: "core.instance.list",
	responseProperties: {
		"list": {
			type: "array",
			items: {
				additionalProperties: false,
				required: ["name", "id", "assigned_slave"],
				properties: {
					"name": { type: "string" },
					"id": { type: "integer" },
					"assigned_slave": { type: ["null", "integer"] },
					"status": { enum: ["stopped", "initialized", "running"] },
				},
			},
		},
	},
});

messages.generateSlaveToken = new Request({
	type: "generate_slave_token",
	links: ["control-master"],
	permission: "core.slave.generate_token",
	requestProperties: {
		"slave_id": { type: "integer" },
	},
	responseProperties: {
		"token": { type: "string" },
	},
});

messages.createSlaveConfig = new Request({
	type: "create_slave_config",
	links: ["control-master"],
	permission: "core.slave.create_config",
	requestProperties: {
		"id": { type: ["integer", "null"] },
		"name": { type: ["string", "null"] },
		"generate_token": { type: "boolean" },
	},
	responseProperties: {
		"serialized_config": { type: "object" },
	},
});

messages.setInstanceOutputSubscriptions = new Request({
	type: "set_instance_output_subscriptions",
	links: ["control-master"],
	permission: "core.instance.follow_log",
	requestProperties: {
		"instance_ids": {
			type: "array",
			items: { type: "integer" },
		},
	},
});

messages.createInstance = new Request({
	type: "create_instance",
	links: ["control-master"],
	permission: "core.instance.create",
	requestProperties: {
		"serialized_config": { type: "object" },
	},
});

messages.getInstanceConfig = new Request({
	type: "get_instance_config",
	links: ["control-master"],
	permission: "core.instance.get_config",
	requestProperties: {
		"instance_id": { type: "integer" },
	},
	responseProperties: {
		"serialized_config": { type: "object" },
	},
});

messages.setInstanceConfigField = new Request({
	type: "set_instance_config_field",
	links: ["control-master"],
	permission: "core.instance.update_config",
	requestProperties: {
		"instance_id": { type: "integer" },
		"field": { type: "string" },
		"value": { type: "string" },
	},
});

messages.setInstanceConfigProp = new Request({
	type: "set_instance_config_prop",
	links: ["control-master"],
	permission: "core.instance.update_config",
	requestProperties: {
		"instance_id": { type: "integer" },
		"field": { type: "string" },
		"prop": { type: "string" },
		"value": {},
	},
});

messages.assignInstanceCommand = new Request({
	type: "assign_instance_command",
	links: ["control-master"],
	permission: "core.instance.assign",
	requestProperties: {
		"instance_id": { type: "integer" },
		"slave_id": { type: "integer" },
	},
});

messages.assignInstance = new Request({
	type: "assign_instance",
	links: ["master-slave"],
	requestProperties: {
		"serialized_config": { type: "object" },
	},
	forwardTo: "instance",
});

messages.startInstance = new Request({
	type: "start_instance",
	links: ["control-master", "master-slave", "slave-instance"],
	permission: "core.instance.start",
	requestProperties: {
		"save": { type: ["string", "null"] },
	},
	forwardTo: "instance",
});

messages.createSave = new Request({
	type: "create_save",
	links: ["control-master", "master-slave", "slave-instance"],
	permission: "core.instance.create_save",
	forwardTo: "instance",
});

messages.loadScenario = new Request({
	type: "load_scenario",
	links: ["control-master", "master-slave", "slave-instance"],
	permission: "core.instance.load_scenario",
	forwardTo: "instance",
	requestProperties: {
		"scenario": { type: "string" },
	},
});

messages.exportData = new Request({
	type: "export_data",
	links: ["control-master", "master-slave", "slave-instance"],
	permission: "core.instance.export_data",
	forwardTo: "instance",
});

messages.stopInstance = new Request({
	type: "stop_instance",
	links: ["control-master", "master-slave", "slave-instance"],
	permission: "core.instance.stop",
	forwardTo: "instance",
});

messages.deleteInstance = new Request({
	type: "delete_instance",
	links: ["control-master", "master-slave"],
	permission: "core.instance.delete",
	forwardTo: "instance",
});

messages.sendRcon = new Request({
	type: "send_rcon",
	links: ["control-master", "master-slave", "slave-instance"],
	permission: "core.instance.send_rcon",
	forwardTo: "instance",
	requestProperties: {
		"command": { type: "string" },
	},
	responseProperties: {
		"result": { type: "string" },
	},
});

messages.listPermissions = new Request({
	type: "list_permissions",
	links: ["control-master"],
	permission: "core.permission.list",
	responseProperties: {
		"list": {
			type: "array",
			items: {
				additionalProperties: false,
				required: ["name", "title", "description"],
				properties: {
					"name": { type: "string" },
					"title": { type: "string" },
					"description": { type: "string" },
				},
			},
		},
	},
});

messages.listRoles = new Request({
	type: "list_roles",
	links: ["control-master"],
	permission: "core.role.list",
	responseProperties: {
		"list": {
			type: "array",
			items: {
				additionalProperties: false,
				required: ["id", "name", "description", "permissions"],
				properties: {
					"id": { type: "integer" },
					"name": { type: "string" },
					"description": { type: "string" },
					"permissions": { type: "array", items: { type: "string" }},
				},
			},
		},
	},
});

messages.createRole = new Request({
	type: "create_role",
	links: ["control-master"],
	permission: "core.role.create",
	requestProperties: {
		"name": { type: "string" },
		"description": { type: "string" },
		"permissions": { type: "array", items: { type: "string" }},
	},
	responseProperties: {
		"id": { type: "integer" },
	},
});

messages.updateRole = new Request({
	type: "update_role",
	links: ["control-master"],
	permission: "core.role.update",
	requestProperties: {
		"id": { type: "integer" },
		"name": { type: "string" },
		"description": { type: "string" },
		"permissions": { type: "array", items: { type: "string" }},
	},
});

messages.grantDefaultRolePermissions = new Request({
	type: "grant_default_role_permissions",
	links: ["control-master"],
	permission: "core.role.update",
	requestProperties: {
		"id": { type: "integer" },
	},
});

messages.deleteRole = new Request({
	type: "delete_role",
	links: ["control-master"],
	permission: "core.role.delete",
	requestProperties: {
		"id": { type: "integer" },
	},
});

messages.listUsers = new Request({
	type: "list_users",
	links: ["control-master"],
	permission: "core.user.list",
	responseProperties: {
		"list": {
			type: "array",
			items: {
				additionalProperties: false,
				required: ["name", "roles", "instances"],
				properties: {
					"name": { type: "string" },
					"roles": { type: "array", items: { type: "integer" }},
					"instances": { type: "array", items: { type: "integer" }},
				},
			},
		},
	},
});

messages.createUser = new Request({
	type: "create_user",
	links: ["control-master"],
	permission: "core.user.create",
	requestProperties: {
		"name": { type: "string" },
	},
});

messages.updateUserRoles = new Request({
	type: "update_user_roles",
	links: ["control-master"],
	permission: "core.user.update_roles",
	requestProperties: {
		"name": { type: "string" },
		"roles": { type: "array", items: { type: "integer" }},
	},
});

messages.deleteUser = new Request({
	type: "delete_user",
	links: ["control-master"],
	permission: "core.user.delete",
	requestProperties: {
		"name": { type: "string" },
	},
});

messages.getMetrics = new Request({
	type: "statistics_exporter:get_metrics",
	links: ["master-slave", "slave-instance"],
	responseProperties: {
		"results": { type: "array" },
	},
});


/**
 * Represents an event sent over the link
 *
 * A one way message without any response or recipt confirmation that
 * can be innitiated by either party of the link.
 *
 * @extends module:lib/link.Message
 * @memberof module:lib/link
 */
class Event extends Message {

	/**
	 * Creates an event
	 *
	 * @param {string} type -
	 *     message type used.  Will have suffix '_event' appended to it for
	 *     the messages sent through this event.
	 * @param {Array<string>} links -
	 *     Links this event is valid on.  Takes an array of strings
	 *     containing "<source>-<target>" specifications.
	 * @param {?string} forwardTo -
	 *     Optional target to forward this request to.  Supported values are
	 *     'master' and 'instance'.  If set to 'instance' an instance_id
	 *     property is implicity added to eventProperties.
	 * @param {?string} broadcastTo -
	 *     Optional target to broadcast this event to.  Only 'instance' is
	 *     currently supported.  An event will only be broadcast towards
	 *     links that are downstream, so sending an event set to instance
	 *     broadcast that's sent to a slave will only be broadcast to that
	 *     slave's instances.
	 * @param {Object<string, Object>} eventProperties -
	 *     Mapping of property values to JSON schema specifications for the
	 *     properties that are valid in the data payload of this event.
	 */
	constructor({ type, links, forwardTo = null, broadcastTo = null, eventProperties = {} }) {
		super();
		this.type = type;
		this.links = links;
		this.forwardTo = forwardTo;
		this.broadcastTo = broadcastTo;

		if (forwardTo === "instance") {
			eventProperties = {
				"instance_id": { type: "integer" },
				...eventProperties,
			};

		} else if (forwardTo !== "master" && forwardTo !== null) {
			throw new Error(`Invalid forwardTo value ${forwardTo}`);
		}

		if (broadcastTo !== "instance" && broadcastTo !== null) {
			throw new Error(`Invalid broadcastTo value ${broadcastTo}`);
		}

		this.eventType = type + "_event";
		this._eventValidator = schema.compile({
			$schema: "http://json-schema.org/draft-07/schema#",
			properties: {
				"type": { const: this.eventType },
				"data": {
					additionalProperties: false,
					required: Object.keys(eventProperties),
					properties: eventProperties,
				},
			},
		});
	}

	/**
	 * Attach to a link
	 *
	 * Set a the handler for the event on the given link if it's a target
	 * for the event.
	 *
	 * If forwardTo was set to 'master' the `forwardEventToMaster` method on
	 * the link is used as the default handler.  If it was set to 'instance'
	 * the `forwardEventToInstance` method on the link is used by default.
	 *
	 * If broadcastTo was set to 'instance' the `broadcastEventToInstance`
	 * method on the link is invoked before the handler.
	 *
	 * Does nothing if the link is not a target for this event.
	 *
	 * @param {Link} link - The link to attach to.
	 * @param {Function} handler -
	 *    Async function to invoke with link set as this to handle the
	 *    event.  Only used on the target side.
	 * @throws {Error} if the handler is needed and not defined.
	 */
	attach(link, handler) {
		// Target side.  Note: Source and target is reversed here.
		if (this.links.includes(`${link.target}-${link.source}`)) {
			// Use forwarder if handler is not present.
			if (!handler) {
				if (this.forwardTo === "instance") {
					handler = link.forwardEventToInstance;
				} else if (this.forwardTo === "master") {
					handler = link.forwardEventToMaster;
				}
			}

			if (
				this.broadcastTo === "instance"
				&& [
					"instance-slave", "slave-master", "control-master", "master-slave",
				].includes(`${link.target}-${link.source}`)
			) {
				if (!handler) {
					handler = link.broadcastEventToInstance;
				} else {
					let originalHandler = handler;
					handler = async (message, event) => {
						await link.broadcastEventToInstance(message, event);
						await originalHandler.call(link, message, event);
					};
				}
			}

			if (!handler) {
				throw new Error(`Missing handler for ${this.eventType} on ${link.source}-${link.target} link`);
			}

			link.setHandler(this.eventType, message => {
				// XXX Should event handlers even be allowed to be async?
				handler.call(link, message, this).catch(err => {
					console.error(`Unexpected error while handling ${this.eventType}`, err);
				});
			}, this._eventValidator);
		}
	}

	/**
	 * Send event over the given link
	 *
	 * Sends the given event data over the link.
	 *
	 * @param {module:lib/link.Link} link - Link to send event over.
	 * @param {Object} data - Data to send with the event.
	 */
	send(link, data = {}) {
		if (!this._eventValidator({ seq: 0, type: this.eventType, data })) {
			console.error(this._eventValidator.errors);
			throw new Error(`Validation failed sending ${this.eventType}`);
		}

		link.connector.send(this.eventType, data);
	}
}

messages.debugWsMessage = new Event({
	type: "debug_ws_message",
	links: ["master-control"],
	eventProperties: {
		"direction": { type: "string" },
		"content": { type: "string" },
	},
});

messages.instanceInitialized = new Event({
	type: "instance_initialized",
	links: ["instance-slave", "slave-master"],
	eventProperties: {
		"instance_id": { type: "integer" },
		"plugins": {
			type: "object",
			additionalProperties: { type: "string" },
		},
	},
});
messages.instanceStarted = new Event({
	type: "instance_started",
	links: ["instance-slave", "slave-master"],
	eventProperties: {
		"instance_id": { type: "integer" },
	},
});
messages.instanceStopped = new Event({
	type: "instance_stopped",
	links: ["instance-slave", "slave-master"],
	eventProperties: {
		"instance_id": { type: "integer" },
	},
});

messages.updateInstances = new Event({
	type: "update_instances",
	links: ["slave-master"],
	eventProperties: {
		"instances": {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["serialized_config", "status"],
				properties: {
					"serialized_config": { type: "object" },
					"status": { enum: ["stopped", "initialized", "running"] },
				},
			},
		},
	},
});

messages.instanceOutput = new Event({
	type: "instance_output",
	links: ["instance-slave", "slave-master", "master-control"],
	forwardTo: "master",
	eventProperties: {
		"instance_id": { type: "integer" },
		"output": {
			type: "object",
			additionalProperties: false,
			required: ["source", "received", "format", "type", "message"],
			properties: {
				"source": { type: "string" },
				"received": { type: "number" },
				"format": { type: "string" },
				"time": { type: "string" },
				"level": { type: "string" },
				"file": { type: "string" },
				"type": { type: "string" },
				"action": { type: "string" },
				"message": { type: "string" },
			},
		},
	},
});

messages.masterConnectionEvent = new Event({
	type: "master_connection_event",
	links: ["slave-instance"],
	eventProperties: {
		"event": { type: "string" },
	},
});

messages.playerEvent = new Event({
	type: "player_event",
	links: ["instance-slave", "slave-master"],
	forwardTo: "master",
	eventProperties: {
		"instance_id": { type: "integer" },
		"type": { type: "string", enum: ["join", "leave"] },
		"name": { type: "string" },
	},
});

/**
 * Attaches all requests and events to the given link
 *
 * Loops through all builtin messages defined and attaches all of them
 * to the link.  The handler used for the messageis looked up on the
 * link instance as the concatenation of the name of the message, the
 * name of message class, and 'Handler'.
 *
 * @param {module:lib/link.Link} link - Link to attach messages to.
 * @memberof module:lib/link
 */
function attachAllMessages(link) {
	for (let [name, message] of Object.entries(messages)) {
		message.attach(link, link[name + message.constructor.name + "Handler"]);
	}
}


module.exports = {
	Message,
	Request,
	Event,

	attachAllMessages,

	messages,
};
