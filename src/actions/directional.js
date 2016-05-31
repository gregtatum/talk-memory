exports.code = `var someList = [];

var obj1 = { link: someList };
var obj2 = { link: someList };
var obj3 = { link: someList };
var obj4 = { link: someList };

obj1 = undefined;
obj2 = undefined;
obj3 = undefined;
obj4 = undefined;
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
  ],
  [
    ["addNode", {display: "[ ]", type: "array", id: "someList"}],
    ["addLink", {source: "window", target:"someList", display: "someList", distance: 3}],
    ["highlight", 1],
  ],
  [
    ["addNode", {display: "{ }", type: "object", id: "obj1"}],
    ["addLink", {source: "obj1", target: "someList", display: "obj1"}],
    ["addLink", {source: "window", target:"obj1"}],
    ["highlight", 3],
  ],
  [
    ["addNode", {display: "{ }", type: "object", id: "obj2"}],
    ["addLink", {source: "obj2", target: "someList", display: "obj2"}],
    ["addLink", {source: "window", target:"obj2"}],
    ["highlight", 4],
  ],
  [
    ["addNode", {display: "{ }", type: "object", id: "obj3"}],
    ["addLink", {source: "obj3", target: "someList", display: "obj3"}],
    ["addLink", {source: "window", target:"obj3"}],
    ["highlight", 5],
  ],
  [
    ["addNode", {display: "{ }", type: "object", id: "obj4"}],
    ["addLink", {source: "obj4", target: "someList", display: "obj4"}],
    ["addLink", {source: "window", target:"obj4"}],
    ["highlight", 6],
  ],
  [
    ["removeLink", ["window", "obj1"]],
    ["highlight", 8],
  ],
  [
    ["removeLink", ["window", "obj2"]],
    ["highlight", 9],
  ],
  [
    ["removeLink", ["window", "obj3"]],
    ["highlight", 10],
  ],
  [
    ["removeLink", ["window", "obj4"]],
    ["highlight", 11],
  ],
  [
    ["removeNode", "obj1"],
  ],
  [
    ["removeNode", "obj2"],
  ],
  [
    ["removeNode", "obj3"],
  ],
  [
    ["removeNode", "obj4"],
  ]
]
