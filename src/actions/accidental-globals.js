exports.code = `function saySomething() {
  var message = "Luke, I am your father.";
  console.log(message);
}

function whisperSomething() {
  message = "I see dead people.";
  console.log(message);
}

function shoutSomething() {
  this.message = "I sound my barbaric yawp.";
  console.log(this.message);
}

saySomething();
whisperSomething();
shoutSomething();
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {type: "callStack", id: "callStack"}],
  ],
  [
    //saySomething();
    ["highlight", 16],
    ["addNode", {type: "function", id: "saySomething", display: "scope"}],
    ["addLink", {source: "callStack", target: "saySomething", display: "saySomething"}],
  ],
  [
    //var message = "Luke, I am your father.";
    ["highlight", 2],
    ["addNode", {type: "value", display: "Luke, I am your father.", id: "message1"}],
    ["addLink", {source: "saySomething", target: "message1", display: "message", distance: 1.5}],
  ],
  [
    ["removeNode", "saySomething"],
    ["highlight", [1,4]],
  ],
  [
    ["removeNode", "message1"],
  ],
  [
    //whisperSomething();
    ["highlight", 17],
    ["addNode", {type: "function", id: "whisperSomething", display: "scope"}],
    ["addLink", {source: "callStack", target: "whisperSomething", display: "whisperSomething"}],
  ],
  [
    //var message = "Luke, I am your father.";
    ["highlight", 7],
    ["addNode", {type: "value", display: "I see dead people.", id: "message2"}],
    ["addLink", {source: "window", target: "message2", display: "message", distance: 1.5}],
    ["addLink", {source: "whisperSomething", target: "message2", display: "window.message", distance: 2.5, dashed: true}],
  ],
  [
    ["removeNode", "whisperSomething"],
    ["highlight", [6,9]],
  ],
  [
    //shoutSomething();
    ["highlight", 18],
    ["addNode", {type: "function", id: "shoutSomething", display: "scope"}],
    ["addLink", {source: "callStack", target: "shoutSomething", display: "shoutSomething"}],
  ],
  [
    //var message = "Luke, I am your father.";
    ["highlight", 12],
    ["addNode", {type: "value", display: "I sound my barbaric yawp.", id: "message3"}],
    ["addLink", {source: "shoutSomething", target: "message3", display: "window.message", distance: 2.5, dashed: true}],
    ["removeLink", ["window", "message2"]],
    ["addLink", {source: "window", target: "message3", display: "message", distance: 1.5}],
  ],
  [
    ["removeNode", "message2"],
  ],
  [
    ["removeNode", "shoutSomething"],
    ["highlight", [11,14]],
  ],
  [
  ],
]
