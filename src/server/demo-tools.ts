// Whether the demo tools answer (D74): the switch itself lives in `src/demo-tools-switch.ts`, a
// module that imports nothing, so client code can share it; the server reads it from here.
export { demoToolsOn } from '@/demo-tools-switch';
