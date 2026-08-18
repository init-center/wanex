# @wanex/team

Optional durable collaboration capabilities for Wanex.

The conversation module records conversations, participants, messages, routing
decisions, delivery leases, child outcomes, and finite discussion rounds. A
deliver route snapshots at most one opportunity per participant. The round
closes atomically only after every delivery has responded, passed, failed, or
been cancelled.

It intentionally does not run recursive speaker loops or infer participant
selection. A projected reply is conversation history, not an instruction to
start another round. Cross-round policy belongs to an application composition
owner.

Orchestrated conversations use one durable conversation-scoped lead. A message
with no target or one typed lead target creates one lead delivery; one typed
participant target creates one direct delivery. Routing is fenced by the
expected current lead in System Service, and direct routing never creates an
implicit observer delivery.

The generic delegation graph module owns durable dependency topology for coding
and task workflows. It does not own a process-local plan registry or a second
sub-agent execution stack. Generic task graphs and Team conversation reuse
Session/Scheduler primitives, but they do not share product semantics. This
package does not render chat UI or implement implicit free-chat loops.

Lead delegation is modeled as a deferred Tool inside the exact lead delivery,
not as additional public Team deliveries. Its durable operation binds the
source delivery, current lead, parent Tool/Turn, target participants, graph and
child Session Turns. Dependency-ready child work is created atomically; graph
progress must be driven by canonical child terminal transitions, never by a
polling scanner. Delegated output remains private Tool evidence until the same
lead Turn resumes and produces the one public summary. The old process-local
delegation runtime has no public entry; durable Team Tool delegation and the
separate generic graph are the only supported paths.
