console.log("boshlandi");

// 5 soniya davoom etadigan og'ir vazifa
const end = Date.now() + 5000;
while (Date.now() < end) {}

console.log("tugadi");

while (true) {
    if (callStack.isEmpty() && queue.length) {
        const task = queue.shift();
        callStack.push(task);
    }
}cv