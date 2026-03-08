# E2E Fixtures

Last updated: 2026-03-08

Sample files used by Playwright setup.

## Files

- `sample-plc.log`
- `sample-mcs.log`
- `sample-csv.csv`
- `sample-tab.log`

## Usage

`global-setup.ts` uploads and parses fixtures before tests and stores resulting session data for test helpers.

Expected backend base URL during setup: `http://localhost:8089`.

## Related Docs

- [../README.md](../README.md)
- [../../../TESTING_CHECKLIST.md](../../../TESTING_CHECKLIST.md)
