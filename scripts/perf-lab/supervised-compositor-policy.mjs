// Fixed-purpose source package, deliberately separate from app package authority.
import { isAbsolute, join, resolve } from 'node:path';
import { CONTAINMENT_LIMITS } from './owned-processes.mjs';
export const COMPOSITOR_CAPS = Object.freeze({ wallMs:60000, cleanupReserveMs:8000, maxRssMb:2048, members:32, startupMs:2000, pollMs:100, stdioBytes:262144, evidenceBytes:1048576, evidenceRecords:1024, procUnixBytes:262144, procEntries:2048, fdEntries:256 });
export const COMPOSITOR_DESCRIPTOR = Object.freeze({ purpose:'private-virtual-compositor-inspection', status:'ownership-inspection-only', modeVerified:false, configuration:'fixed-existing-mode-offline-contract', appWaylandBinding:'not-implemented', gpuRuntime:'blocked', standardAcceptance:false,
  limits:`${CONTAINMENT_LIMITS} Descendant-only discovery; no same-session adoption. Unexpected executables, unknown owners, permission gaps and missing memory fail closed. Cleanup confirms only observed identities, never exhaustive absence of unobserved escaped descendants. Private D-Bus config omits activation sources and denies StartServiceByName; system-bus redirection is a client convention, not a kernel/network sandbox. No kernel RSS enforcement. Bounded synchronous filesystem/proc I/O is not a hard kernel deadline. Short helpers may carry authorized_fdexec_completed evidence (captured trusted gate, verified FD receipt and clean exit), not an observed live executable; app/wrapper still require live post-exec identity. Helper readbacks can certify observed private output metadata only, not installed-version compatibility, rendering, physical scanout or app readiness. Fixed existing 2560x1600@180 mode required; custom mode creation is unsupported.` });
export const SYSTEM_EXECUTABLES = Object.freeze(['dbus-run-session','kwin_wayland','kscreen-doctor','wayland-info','dbus-daemon']);
export function compositorPlan(runDir) {
  if (typeof runDir !== 'string' || !isAbsolute(runDir) || resolve(runDir)!==runDir || !/^\/tmp\/perf-lab-[A-Za-z0-9-]+\/reservation$/.test(runDir)) throw Error('Invalid private compositor reservation path');
  const plan={revision:1,runDir,home:join(runDir,'home'),config:join(runDir,'config'),data:join(runDir,'data'),cache:join(runDir,'cache'),runtime:join(runDir,'runtime'),socketPath:join(runDir,'runtime/perf-0')};
  if (Buffer.byteLength(plan.socketPath)>107) throw Error('Unix socket path exceeds 107 bytes');
  return plan;
}
export function validateCompositorPlan(value) {
  const expected=compositorPlan(value?.runDir);
  if (Object.keys(value).length!==Object.keys(expected).length || Object.entries(expected).some(([k,v])=>value[k]!==v)) throw Error('Invalid fixed compositor plan');
  return expected;
}
export function compositorEnvironment(plan) {
  plan=validateCompositorPlan(plan);
  // WHY: whitelist, never subtract from a real desktop environment (Qt loaders,
  // real bus, DISPLAY, XAUTHORITY, preload and profile overrides cannot leak in).
  return {PATH:'/usr/bin:/bin',LANG:'C.UTF-8',HOME:plan.home,DBUS_SYSTEM_BUS_ADDRESS:`unix:path=${join(plan.runtime,'no-system-bus')}`,XDG_CONFIG_HOME:plan.config,XDG_DATA_HOME:plan.data,XDG_CACHE_HOME:plan.cache,XDG_RUNTIME_DIR:plan.runtime,WAYLAND_DISPLAY:'perf-0',QT_QPA_PLATFORM:'wayland'};
}
export function compositorBusConfiguration(plan) {
  plan=validateCompositorPlan(plan);
  // WHY: an isolated bus address does not isolate activation. No includes,
  // service directories, activation helper or systemd activation are requested.
  // WHY: dbus-daemon rejects send_member without send_interface OR send_path.
  // Qualify both denials by the canonical bus object path, not an interface:
  // the interface header is optional. Installed dbus-daemon(1) documents
  // send_path and combined header matching; mandatory policy is applied last.
  // This fixes the recorded daemon parse failure; offline XML pins below are
  // a contract check, not proof that a future daemon accepted this config.
  // Plan's fixed ASCII path alphabet needs neither XML nor D-Bus escaping.
  return `<busconfig>
  <type>session</type>
  <listen>unix:path=${join(plan.runtime,'bus')}</listen>
  <auth>EXTERNAL</auth>
  <policy context="default">
    <allow user="*"/>
    <allow own="*"/>
    <allow send_destination="*"/>
    <allow receive_sender="*"/>
  </policy>
  <policy context="mandatory">
    <deny send_destination="org.freedesktop.DBus" send_path="/org/freedesktop/DBus" send_member="StartServiceByName"/>
    <deny send_destination="org.freedesktop.DBus" send_path="/org/freedesktop/DBus" send_member="UpdateActivationEnvironment"/>
  </policy>
  <limit name="max_completed_connections">32</limit>
  <limit name="max_incomplete_connections">8</limit>
  <limit name="max_message_size">262144</limit>
  <limit name="max_incoming_bytes">1048576</limit>
  <limit name="max_outgoing_bytes">1048576</limit>
</busconfig>\n`;
}
export function compositorCommand(receipts,plan) {
  plan=validateCompositorPlan(plan);
  // Historical source 1e7f62b4 gpu-cost.mjs:128 uses these separated KWin flags.
  // Installed dbus-run-session(1), OPTIONS: --config-file forwards this file to
  // the daemon INSTEAD of --session. No wrapper replacement or invented argv.
  // No invocation/help probe here; installed-version compatibility is unverified.
  const binary=receipts['dbus-run-session'].path;
  return {binary,identity:receipts['dbus-run-session'].identity,argv:[binary,`--dbus-daemon=${receipts['dbus-daemon'].path}`,`--config-file=${join(plan.runDir,'bus.conf')}`,'--',receipts.kwin_wayland.path,'--virtual','--width','2560','--height','1600','--socket','perf-0','--no-lockscreen','--no-global-shortcuts']};
}
