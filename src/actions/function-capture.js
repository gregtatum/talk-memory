exports.code = `function createLogger() {
  var messages = [];

  return function logger(message) {
    messages.push(message);
    console.log(messages);
  }
}

var captainsLog = createLogger();
var bosunsLog = createLogger();

captainsLog("Captain's log");
captainsLog("Supplemental");

bosunsLog("Bosun is short for boatswain.")
bosunsLog("Swab the deck matey.")

captainsLog = undefined
bosunsLog = undefined
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
  ],
  [
    // function definition
    ["highlight", [1,8]],
  ],
  [
    // createLogger()
    ["addNode", {type: "callStack", id: "callStack"}],
    ["highlight", ["10:19", "10:33"]],
  ],
  [
    // function block
    ["addNode", {display: "scope", type: "function", id: "createLogger"}],
    ["addLink", {source: "callStack", target: "createLogger", display: "createLogger"}],
    ["highlight", [2, 7]],
  ],
  [
    // var messages = []
    ["addNode", {display: "[ ]", type: "array", id: "messages1"}],
    ["addLink", {source: "createLogger", target: "messages1", display: "messages"}],
    ["highlight", 2],
  ],
  [
    // function logger() {}
    ["addNode", {display: "fn", type: "function", id: "captainsLog"}],
    ["addLink", {source: "createLogger", target: "captainsLog", display: "logger"}],
    ["highlight", ["4:10", "7:4"]],
  ],
  [
    // messages
    ["addLink", {source: "captainsLog", target: "messages1", display: "messages"}],
    ["highlight", ["5:5", "5:13"]],
  ],
  [
    // return
    ["removeNode", "createLogger"],
    ["removeNode", "callStack"],
    ["highlight", ["4:3", "4:9"]],
  ],
  [
    // var captainsLog
    ["addLink", {source: "window", target: "captainsLog", display: "captainsLog"}],
    ["highlight", ["10:1", "10:16"]],
  ],
  [
    // var bosunsLog = createLogger()
    ["addNode", {display: "[ ]", type: "array", id: "messages2"}],
    ["addNode", {display: "fn", type: "function", id: "bosunsLog"}],
    ["addLink", {source: "window", target: "bosunsLog", display: "bonsunsLog"}],
    ["addLink", {source: "bosunsLog", target: "messages2", display: "messages"}],
    ["highlight", 11],
  ],
  [
    // captainsLog("Captain's log")
    ["highlight", 13],
  ],
  [
    // messages.push(message)
    ["addNode", {display: '"Captain\'s log"', type: "value", id: "string1"}],
    ["addLink", {source: "messages1", target: "string1"}],
    ["highlight", 5],
  ],
  [
    // console.log(messages)
    ["highlight", 6],
  ],
  [
    // captainsLog("Supplemental");
    ["addNode", {display: '"Supplemental"', type: "value", id: "string2"}],
    ["addLink", {source: "messages1", target: "string2"}],
    ["highlight", 14],
  ],
  [
    // bosunsLog("Bosun is short for botswain.")
    ["highlight", 16],
    ["addNode", {display: '"Bosun is..."', type: "value", id: "string3"}],
    ["addLink", {source: "messages2", target: "string3"}],
  ],
  [
    // bosunsLog("Swab the deck")
    ["highlight", 17],
    ["addNode", {display: '"Swab the deck..."', type: "value", id: "string4"}],
    ["addLink", {source: "messages2", target: "string4"}],
  ],
  [
    // captainsLog = undefined
    ["highlight", 19],
    ["removeLink", ["window", "captainsLog"]],
  ],
  [
    // bosunsLog = undefined
    ["highlight", 20],
    ["removeLink", ["window", "bosunsLog"]],
  ],
  [
    ["removeNode", "captainsLog"],
    ["removeNode", "bosunsLog"],
    ["removeNode", "string1"],
    ["removeNode", "string2"],
    ["removeNode", "string3"],
    ["removeNode", "string4"],
    ["removeNode", "messages1"],
    ["removeNode", "messages2"],
  ],
]
