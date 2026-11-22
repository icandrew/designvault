// Removes the isolated end-to-end test vault before the test server starts.
import fs from "node:fs";
import path from "node:path";

fs.rmSync(path.resolve("test-data/e2e"), { recursive: true, force: true });
