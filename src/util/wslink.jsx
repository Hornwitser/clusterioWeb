

import link from "./../lib/link"
import { Control, ControlConnector } from "./../util/websocket"
const errors = require("./../lib/errors");

// Create WS connection to master. Used by all components through the interface exported here.
(async () => {
    window.controlConnector = new ControlConnector(
        localStorage.getItem("master_url"),
        10, // Reconnect delay
        localStorage.getItem("master_token"),
    );
    window.control = new Control(window.controlConnector, []);
    try {
        await window.controlConnector.connect();
    } catch (err) {
        if (err instanceof errors.AuthenticationFailed) {
            throw new errors.StartupError(err.message);
        }
        throw err;
    }
    let response = await link.messages.listSlaves.send(window.control);

    // console.log(response.list);
    console.log(link.messages)
    let data = {}
    // for (let key in {
    //     ...link.messages,
    // }) {
    //     if (link.messages[key].constructor.name === "Request") {
    //         let resp, error
    //         try{
    //         resp = await link.messages[key].send(window.control)
    //         } catch(e){
    //             error = e
    //         }
    //         data[key] = resp
    //         data[key].error = error
    //     }
    // }
    // console.log(data)
})()

let listSlaves = createListFunction("listSlaves")
let listInstances = createListFunction("listInstances")
let listUsers = createListFunction("listUsers", "name")
let listRoles = createListFunction("listRoles")
let listPermissions = createListFunction("listPermissions", "name")

let startInstance = async function ({ instance_id, save = null }) {
    return await link.messages.startInstance.send(window.control, { instance_id, save })
}
let stopInstance = async function ({ instance_id }) {
    return await link.messages.stopInstance.send(window.control, { instance_id })
}
let createInstance = async function (serialized_config) {
    return await link.messages.createInstance.send(window.control, { serialized_config });
}
let deleteInstance = async function ({ instance_id }) {
    return await link.messages.deleteInstance.send(window.control, { instance_id });
}
let assignInstance = async function ({ instance_id, slave_id }) {
    return await link.messages.assignInstanceCommand.send(window.control, {
        instance_id,
        slave_id,
    });
}
let createSave = async function ({ instance_id }) {
    return await link.messages.createSave.send(window.control, { instance_id });
}
let getInstanceConfig = async function ({ instance_id }) {
    return await link.messages.getInstanceConfig.send(window.control, { instance_id });
}
let setInstanceConfigField = async function ({ instance_id, field, value }) {
    return await link.messages.setInstanceConfigField.send(window.control, {
        instance_id,
        field,
        value: typeof value === "object" ? JSON.stringify(value) : value,
    });
}
let setInstanceConfigProp = async function ({ instance_id, field, prop, value }) {
    return await link.messages.setInstanceConfigProp.send(window.control, {
        instance_id,
        field,
        prop,
        value, // JSON Object
    });
}
let sendRcon = async function ({ instance_id, command }) {
    return await link.messages.sendRcon.send(window.control, { instance_id, command })
}
let setInstanceOutputSubscriptions = async function ({ instance_id }) {
    return await link.messages.setInstanceOutputSubscriptions.send(window.control, { instance_ids: [instance_id] })
}

let createUser = async function ({name}){
    return await link.messages.createUser.send(window.control, {name})
}
let deleteUser = async function({name}){
    return await link.messages.deleteUser.send(window.control, {name})
}
let setRoles = async function({name, roles}){
    return await link.messages.updateUserRoles.send(window.control, {
        name,
        roles,
    })
}

let createRole = async function({name, description, permissions = []}){
    return await link.messages.createRole.send(window.control, {name, description, permissions})
}
let updateRole = async function({id, name, description, permissions}){
    return await link.messages.updateRole.send(window.control, {
        id, name, description, permissions
    })
}

export {
    listSlaves,
    listInstances,
    listUsers,
    createUser,
    deleteUser,
    listRoles,
    setRoles,
    createRole,
    updateRole,
    listPermissions,
    startInstance,
    stopInstance,
    createInstance,
    deleteInstance,
    assignInstance,
    createSave,
    getInstanceConfig,
    setInstanceConfigField,
    setInstanceConfigProp,
    sendRcon,
    setInstanceOutputSubscriptions,
}

function createListFunction(name, key) {
    return async () => {
        return (await link.messages[name].send(window.control)).list.map(addKey(key || "id"));
    }
}
function addKey(key) {
    return function (el) {
        return {
            ...el,
            key: el[key]
        }
    }
}