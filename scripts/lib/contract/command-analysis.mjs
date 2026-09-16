const TEST_FLAG = /(^|\s)--test(\s|$)/;
export const testFlagPresent = (command) => TEST_FLAG.test(command.replace(/['\"\\]/g, ""));

export const CODE_EXT = "mjs|js|cjs|sh|ts|mts|cts";
export const TEST_FILE_RE = new RegExp(`(?:^|/)(?:test/.+|[^/]*\\.test|[^/]*-test|[^/]*_test|test-[^/]*|test)\\.(?:${CODE_EXT})$`);

export const SETUP_FLAGS = new Set(["--import", "-r", "--require", "--loader", "--experimental-loader"]);
