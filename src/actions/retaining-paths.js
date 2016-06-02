exports.code = `var a = {};
a.b = {};
a.b.c = {};
a.b.c.d = {};
a.b.c.d.largeThing = new ArrayBuffer(100000);

// Live demo: ./retaining.html
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
  ],
  [
    ["addNode", {type: "value", id: "a", display: "{}"}],
    ["addLink", {source: "window", target: "a", display: "a"}],
    ["highlight", 1],
  ],
  [
    ["addNode", {type: "value", id: "b", display: "{}"}],
    ["addLink", {source: "a", target: "b", display: "b"}],
    ["highlight", 2],
  ],
  [
    ["addNode", {type: "value", id: "c", display: "{}"}],
    ["addLink", {source: "b", target: "c", display: "c"}],
    ["highlight", 3],
  ],
  [
    ["addNode", {type: "value", id: "d", display: "{}"}],
    ["addLink", {source: "c", target: "d", display: "d"}],
    ["highlight", 4],
  ],
  [
    ["addNode", {type: "object", id: "largeThing", display: "............. ArrayBuffer", radius: 5}],
    ["addLink", {source: "d", target: "largeThing", distance: 2, display: "largeThing \u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0"}],
    ["highlight", 5],
  ],
]
