exports.code = `var myNumber = 0;
var myObject = {foo: 'bar'};
var myArray = ['a','b','c','d','e'];

function myFunction() {
  console.log('Well this is fun')
}

myNumber = undefined;
myObject = undefined;
delete window.myFunction;

setTimeout(function() {
  myArray = undefined;
}, 10000);
`

exports.lineLength = 60

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
  ],
  [
    ["addNode", {type: "value", id: "myNumber", display: "0"}],
    ["addLink", {source: "window", target: "myNumber", display: "myNumber", distance: 1.5}],
    ["highlight", 1],
  ],
  [
    ["addNode", {type: "object", id: "myObject", display: "{ }"}],
    ["addLink", {source: "window", target: "myObject", display: "myObject"}],
    ["highlight", 2],
  ],
  [
    ["addNode", {type: "array", id: "myArray", display: "[ ]"}],
    ["addNode", {type: "value", id: "array-a", display: "a"}],
    ["addNode", {type: "value", id: "array-b", display: "b"}],
    ["addNode", {type: "value", id: "array-c", display: "c"}],
    ["addNode", {type: "value", id: "array-d", display: "d"}],
    ["addNode", {type: "value", id: "array-e", display: "e"}],
    ["addLink", {source: "window", target: "myArray", display: "myArray"}],
    ["addLink", {source: "myArray", target: "array-a"}],
    ["addLink", {source: "myArray", target: "array-b"}],
    ["addLink", {source: "myArray", target: "array-c"}],
    ["addLink", {source: "myArray", target: "array-d"}],
    ["addLink", {source: "myArray", target: "array-e"}],
    ["highlight", 3],
  ],
  [
    ["addNode", {type: "function", id: "myFunction", display: "function() {}"}],
    ["addLink", {source: "window", target: "myFunction", display: "myFunction"}],
    ["highlight", [5,7]],
  ],
  [
    ["removeLink", ["window", "myNumber"]],
    ["highlight", 9],
  ],
  [
    ["removeLink", ["window", "myObject"]],
    ["highlight", 10],
  ],
  [
    ["removeLink", ["window", "myFunction"]],
    ["highlight", 11],
  ],
  [
    ["highlight", [13, 15]],
  ],
  [
    ["removeNode", "myNumber"],
  ],
  [
    ["removeNode", "myObject"],
  ],
  [
    ["removeNode", "myFunction"],
  ],
  [
    ["removeLink", ["window", "myArray"]],
    ["highlight", 14],
  ],
  [
    ["removeNode", "myArray"],
    ["removeNode", "array-a"],
    ["removeNode", "array-b"],
    ["removeNode", "array-c"],
    ["removeNode", "array-d"],
    ["removeNode", "array-e"],
  ],
]
