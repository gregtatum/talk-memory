exports.code = `function ClickCounter() {
  this.countClicks = 0;
  var scope = this;
  this.handler = function buttonClick() {
    scope.countClicks++;
  };

  $('button').on('click', this.handler);
}

ClickCounter.prototype.destroy = function() {
  $('button').off('click', this.handler);
}

var clickCounter1 = new ClickCounter();
var clickCounter2 = new ClickCounter();
var clickCounter3 = new ClickCounter();

// Stop execution, then later run:

clickCounter1.destroy();
clickCounter2.destroy();
clickCounter3.destroy();

delete clickCounter1;
delete clickCounter2;
delete clickCounter3;
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {display: "button", type: "object", id: "button"}],
    ["addLink", {source: "window", target: "button", dashed: true}],

    // clickCounter1
    ["addNode", {display: "clickCounter1", type: "object", id: "clickCounter1"}],
    ["addNode", {display: "buttonClick", type: "function", id: "buttonClick1"}],
    ["addLink", {source: "window", target: "clickCounter1"}],
    ["addLink", {source: "buttonClick1", target: "clickCounter1"}],
    ["addLink", {source: "button", target: "buttonClick1"}],

    // clickCounter2
    ["addNode", {display: "clickCounter2", type: "object", id: "clickCounter2"}],
    ["addNode", {display: "buttonClick", type: "function", id: "buttonClick2"}],
    ["addLink", {source: "window", target: "clickCounter2"}],
    ["addLink", {source: "buttonClick2", target: "clickCounter2"}],
    ["addLink", {source: "button", target: "buttonClick2"}],

    // clickCounter3
    ["addNode", {display: "clickCounter3", type: "object", id: "clickCounter3"}],
    ["addNode", {display: "buttonClick", type: "function", id: "buttonClick3"}],
    ["addLink", {source: "window", target: "clickCounter3"}],
    ["addLink", {source: "buttonClick3", target: "clickCounter3"}],
    ["addLink", {source: "button", target: "buttonClick3"}],
    ["highlight", 19],
  ],
  [
    ["removeLink", ["button", "buttonClick1"]],
    ["highlight", 21],
  ],
  [
    ["removeLink", ["button", "buttonClick2"]],
    ["highlight", 22],
  ],
  [
    ["removeLink", ["button", "buttonClick3"]],
    ["highlight", 23],
  ],
  [
    ["removeLink", ["window", "clickCounter1"]],
    ["highlight", 25],
  ],
  [
    ["removeLink", ["window", "clickCounter2"]],
    ["highlight", 26],
  ],
  [
    ["removeLink", ["window", "clickCounter3"]],
    ["highlight", 27],
  ],
  [
    ["removeNode", "clickCounter1"],
    ["removeNode", "buttonClick1"],
  ],
  [
    ["removeNode", "clickCounter2"],
    ["removeNode", "buttonClick2"],
  ],
  [
    ["removeNode", "clickCounter3"],
    ["removeNode", "buttonClick3"],
  ]
]
