
const testCases = [
  "Intel(R) Core(TM) i9-14900K CPU @ 3.20GHz",
  "AMD Ryzen 7 7800X3D 8-Core Processor",
  "Intel(R) Core(TM) i7-12700H",
  "AMD Ryzen 9 7950X 16-Core Processor",
  "Apple M1 Pro"
];

function cleanCpuName(model) {
  return model
    .replace(/\(R\)/gi, '')
    .replace(/\(TM\)/gi, '')
    .replace(/\s+CPU\s+/gi, ' ')
    .replace(/\d+-Core Processor/gi, '') // Handle "8-Core Processor"
    .replace(/-?Core\s+Processor/gi, ' ')
    .replace(/\s+Processor\s+/gi, ' ')
    .replace(/@.*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

console.log("--- CPU Name Cleaning Test ---");
testCases.forEach(cpu => {
  console.log(`Original: "${cpu}"`);
  console.log(`Cleaned:  "${cleanCpuName(cpu)}"`);
  console.log("-------------------");
});
