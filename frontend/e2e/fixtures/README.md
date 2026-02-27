# E2E Fixtures

Sample files used by Playwright setup.

## Files

- `sample-plc.log` (PLC debug format)
- `sample-mcs.log` (MCS format)
- `sample-csv.csv` (CSV signal format)
- `sample-tab.log` (tab-separated PLC format)

## Usage

`global-setup.ts` uploads/parses fixtures before tests and stores resulting session data for test helpers.

Required backend endpoint during setup: `http://localhost:8089`.
