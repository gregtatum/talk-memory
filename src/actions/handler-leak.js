exports.code = `function ClickCounter() {
  this.countClicks = 0;

  var scope = this;
  $('button').click(function buttonClick() {
    scope.countClicks++;
  });
}

var clickCounter1 = new ClickCounter();
var clickCounter2 = new ClickCounter();
var clickCounter3 = new ClickCounter();

// Stop execution, then later run:

clickCounter1 = undefined;
clickCounter2 = undefined;
clickCounter3 = undefined;
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {display: "button", type: "object", id: "button"}],
    ["addLink", {source: "window", target: "button", dashed: true}],
    ["addNode", {type: "callStack", id: "callStack"}],
  ],
  [
    ["highlight", [1, 8]],
  ],
  [
    ["addNode", {display: "{ }", type: "object", id: "clickCounter1"}],
    ["highlight", ["10:21", "10:39"]],
  ],
  [
    // ["addLink", {source: "window", target: "callStack", dashed: true}],
    ["addNode", {display: "scope", type: "function", id: "scope1"}],
    ["addLink", {display: "ClickCounter", source: "callStack", target: "scope1"}],
    ["addLink", {display: "this", source: "scope1", target: "clickCounter1"}],
    ["highlight", [2, 7]],
  ],

  [
    ["addNode", {display: "0", type: "value", id: "countClicks1"}],
    ["addLink", {display: "countClicks", source: "clickCounter1", target: "countClicks1"}],
    ["highlight", ["2:3", "2:24"]],
  ],
  [
    ["renameLink", {display: "this / scope", source: "scope1", target: "clickCounter1"}],
    ["highlight", ["4:3", "4:20"]],
  ],
  [
    ["addNode", {display: "fn", type: "function", id: "buttonClick1"}],
    ["addLink", {source: "scope1", target: "buttonClick1"}],
    ["highlight", ["5:21", "7:4"]],
  ],
  [
    ["addLink", {source: "buttonClick1", target: "clickCounter1"}],
    ["highlight", ["6:5", "6:10"]],
  ],
  [
    ["addLink", {display: "onClick", source: "button", target: "buttonClick1"}],
    ["highlight", [5, 7]],
  ],
  [
    ["removeNode", "countClicks1"]
  ],
  [
    ["removeNode", "scope1"],
  ],
  [
    ["addLink", {display: "clickCounter1", source: "window", target: "clickCounter1", distance: 2}],
    ["highlight", ["10:1", "10:18"]],
  ],
  [
    ["addNode", {display: "{}", type: "object", id: "clickCounter2"}],
    ["addNode", {display: "fn", type: "function", id: "buttonClick2"}],
    ["addLink", {display: "clickCounter2", source: "window", target: "clickCounter2", distance: 2}],
    ["addLink", {source: "buttonClick2", target: "clickCounter2"}],
    ["addLink", {display: "onClick", source: "button", target: "buttonClick2"}],
    ["highlight", 11],
  ],
  [
    ["addNode", {display: "{}", type: "object", id: "clickCounter3"}],
    ["addNode", {display: "fn", type: "function", id: "buttonClick3"}],
    ["addLink", {display: "clickCounter3", source: "window", target: "clickCounter3"}],
    ["addLink", {source: "buttonClick3", target: "clickCounter3"}],
    ["addLink", {display: "onClick", source: "button", target: "buttonClick3"}],
    ["highlight", 12],
  ],
  [
    ["removeLink", ["window", "clickCounter1"]],
    ["highlight", 16],
  ],
  [
    ["removeLink", ["window", "clickCounter2"]],
    ["highlight", 17],
  ],
  [
    ["removeLink", ["window", "clickCounter3"]],
    ["highlight", 18],
  ]
]
