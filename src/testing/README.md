# Local failure evidence fixtures

Repository guide. `runner.ts` executes the 27 scenarios declared in `scenarios.ts`; `boundaryScenarios.ts` executes 12 provider-boundary scenarios with local SDK doubles. Public imports use `smallbusiness-footprint/testing` explicitly. Importing it does not register production fault injection.

The saved/reloaded `record` is diagnosis input. `observed` is an independent test result and must never influence diagnosis. Scenario plans, simulated provider ledgers and private fault choices remain outside the record. Both custom `persist` and `load` hooks are required together; failed storage cannot be described as stored evidence.

Inspect actual exported catalogs rather than assuming one list covers both families. Run `src/__tests__/testing/` for recording/normalization/layer contracts. These fixtures make no network, model or cloud calls and do not prove live vendor behavior. Keep them out of public customer routes.
