exports.code = `function MyBigApp() { ... }

var myApp = new MyBigApp();

$('#close-button').click(
  myApp.close.bind(myApp)
);

myApp = undefined;
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {display: "#close-button", type: "object", id: "button"}],
    ["addLink", {source: "window", target: "button", dashed: true}],
    // ["addNode", {type: "callStack", id: "callStack"}],
  ],
  [
    ["highlight", 1],
  ],
  [
    ["addNode", {display: ". . ..  { }", type: "object", id: "myApp", radius: 3}],
    ["addLink", {source: "window", target: "myApp", display: "myApp", distance: 2}],
    ["highlight", 3],
  ],
  [
    ["addNode", {display: "fn()", type: "object", id: "close"}],
    ["addLink", {source: "close", target: "myApp", display: "bind", distance: 2}],
    ["highlight", 6],
  ],
  [
    ["addLink", {source: "button", target: "close", display: "click handler", distance: 2}],
    ["highlight", [5, 7]],
  ],
  [
    ["removeLink", ["window","myApp"]],
  ]
]
