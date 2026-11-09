const json = value => `${JSON.stringify(value)}\n`;
const unchanged = 'Private admin note: retain exactly.\n';
const triagePolicy={
 categories:['invoice','scheduling','information'],priorities:['high','normal','low'],
 categoryRules:'Invoice messages are invoice; otherwise meeting-change requests are scheduling; other questions are information.',
 priorityRules:'Invoice recipient corrections with an explicit deadline are high; information questions without a deadline are low; all other messages are normal.',
 replyRules:'Select the matching template and render it verbatim, substituting only facts explicitly present in the message. Do not add any sentences or make commitments. Use the invoice number from subject or body, amount as written without the dollar sign, ISO date, and explicitly proposed weekday as applicable.',
 templates:{
  invoice:'Thanks for your message about invoice {invoiceId} for ${amountUsd}, due {dueDate}.',
  scheduling:'What time on {proposedDay} are you proposing? The meeting change is not yet confirmed.',
  information:'Which office location do you mean? I do not have a confirmed mailing address.',
  recipientCorrection:'What is the correct recipient name for invoice {invoiceId} (${amountUsd})? You requested this before {dueDate}.',
 }
};

export const heldoutCases = [
  {
    id: 'reimbursement-policy-decisions', category: 'administrative-decisions', domain: 'policy-driven-reimbursement',
    requiredCapabilities: ['single-turn', 'filesystem'],
    instruction: 'Apply policy.md to every claim in claims.json. Write decisions.json as an array in input order, each object exactly {claimId, eligible, reimbursableUsd, reasonCode}; use reasonCode ELIGIBLE or the applicable policy reason. Write totals.json exactly {eligibleUsd, rejectedUsd}. Preserve both inputs and admin-note.txt byte-for-byte. Do not infer undocumented exceptions.',
    files: {
      'policy.md': 'Employees may claim meals up to $30 per day with a dated receipt. Taxi rides require a receipt and a documented business purpose. Personal purchases are never reimbursable. Amounts are USD; reject a claim that exceeds its category limit in full. Reason codes: ELIGIBLE for accepted claims; OVER_LIMIT for amounts exceeding the meal limit; NO_BUSINESS_PURPOSE for taxi claims without a documented purpose; PERSONAL for personal purchases; NO_RECEIPT for a missing required receipt.\n',
      'claims.json': json([
        { claimId: 'R1', category: 'meal', amountUsd: 24, date: '2026-04-03', receipt: true, businessPurpose: 'client meeting' },
        { claimId: 'R2', category: 'meal', amountUsd: 32, date: '2026-04-03', receipt: true, businessPurpose: 'client meeting' },
        { claimId: 'R3', category: 'taxi', amountUsd: 18, date: '2026-04-04', receipt: true, businessPurpose: 'site visit' },
        { claimId: 'R4', category: 'taxi', amountUsd: 12, date: '2026-04-04', receipt: true, businessPurpose: '' },
        { claimId: 'R5', category: 'personal', amountUsd: 9, date: '2026-04-05', receipt: true, businessPurpose: 'commute' },
        { claimId: 'R6', category: 'taxi', amountUsd: 7, date: '2026-04-05', receipt: false, businessPurpose: 'site visit' },
      ]),
      'admin-note.txt': unchanged,
    },
    oracle: {
      'decisions.json': json([
        { claimId: 'R1', eligible: true, reimbursableUsd: 24, reasonCode: 'ELIGIBLE' },
        { claimId: 'R2', eligible: false, reimbursableUsd: 0, reasonCode: 'OVER_LIMIT' },
        { claimId: 'R3', eligible: true, reimbursableUsd: 18, reasonCode: 'ELIGIBLE' },
        { claimId: 'R4', eligible: false, reimbursableUsd: 0, reasonCode: 'NO_BUSINESS_PURPOSE' },
        { claimId: 'R5', eligible: false, reimbursableUsd: 0, reasonCode: 'PERSONAL' },
        { claimId: 'R6', eligible: false, reimbursableUsd: 0, reasonCode: 'NO_RECEIPT' },
      ]),
      'totals.json': json({ eligibleUsd: 42, rejectedUsd: 60 }),
    },
    check: `from decimal import Decimal
claims = json.loads((root/'claims.json').read_text())
rows = json.loads((root/'decisions.json').read_text())
assert isinstance(rows, list) and len(rows) == len(claims)
assert all(type(row) is dict and set(row) == {'claimId','eligible','reimbursableUsd','reasonCode'} for row in rows)
expected = [('R1',True,24,'ELIGIBLE'),('R2',False,0,'OVER_LIMIT'),('R3',True,18,'ELIGIBLE'),('R4',False,0,'NO_BUSINESS_PURPOSE'),('R5',False,0,'PERSONAL'),('R6',False,0,'NO_RECEIPT')]
for row, (cid, eligible, amount, reason) in zip(rows, expected):
    assert (row['claimId'],row['eligible'],row['reasonCode']) == (cid,eligible,reason)
    assert type(row['eligible']) is bool and type(row['reimbursableUsd']) in (int,float) and Decimal(str(row['reimbursableUsd'])) == amount
assert json.loads((root/'totals.json').read_text()) == {'eligibleUsd':42,'rejectedUsd':60}
assert sum(Decimal(str(r['reimbursableUsd'])) for r in rows if r['eligible']) == 42
assert (root/'policy.md').read_text() == ${JSON.stringify('Employees may claim meals up to $30 per day with a dated receipt. Taxi rides require a receipt and a documented business purpose. Personal purchases are never reimbursable. Amounts are USD; reject a claim that exceeds its category limit in full. Reason codes: ELIGIBLE for accepted claims; OVER_LIMIT for amounts exceeding the meal limit; NO_BUSINESS_PURPOSE for taxi claims without a documented purpose; PERSONAL for personal purchases; NO_RECEIPT for a missing required receipt.\n')}
assert (root/'claims.json').read_text() == ${JSON.stringify(json([{claimId:'R1',category:'meal',amountUsd:24,date:'2026-04-03',receipt:true,businessPurpose:'client meeting'},{claimId:'R2',category:'meal',amountUsd:32,date:'2026-04-03',receipt:true,businessPurpose:'client meeting'},{claimId:'R3',category:'taxi',amountUsd:18,date:'2026-04-04',receipt:true,businessPurpose:'site visit'},{claimId:'R4',category:'taxi',amountUsd:12,date:'2026-04-04',receipt:true,businessPurpose:''},{claimId:'R5',category:'personal',amountUsd:9,date:'2026-04-05',receipt:true,businessPurpose:'commute'},{claimId:'R6',category:'taxi',amountUsd:7,date:'2026-04-05',receipt:false,businessPurpose:'site visit'}]))}
assert (root/'admin-note.txt').read_text() == ${JSON.stringify(unchanged)}
assert sorted(p.name for p in root.iterdir()) == ['admin-note.txt','claims.json','decisions.json','policy.md','totals.json']`,
  },
  {
    id: 'offset-aware-shift-schedule', category: 'planning', domain: 'feasible-scheduling',
    requiredCapabilities: ['single-turn', 'filesystem'],
    instruction: 'Create schedule.json containing one assignment per job with exactly {jobId, start, end, resource}. Use timezone-aware ISO-8601 strings (Z or explicit numeric offsets) and whole-minute instants; compare instants rather than clock labels, and do not infer a timezone. Respect durations, availability windows, resource skills, and non-overlap per resource. First minimize total elapsed minutes from each job earliest start to its scheduled start. Break ties by the alphabetical resource-name vector in input job order, then by the UTC start-time vector in that same order. Write schedule-summary.json with exactly {totalDelayMinutes, assignmentCount, resourceJobCounts}; resourceJobCounts maps every resource to its integer job count, including zero. Preserve all inputs and readme.txt byte-for-byte.',
    files: {
      'jobs.json': json({ jobs: [
        { jobId:'A', durationMinutes:60, earliestStart:'2026-06-01T09:00:00+02:00', latestEnd:'2026-06-01T12:00:00+02:00', skill:'install' },
        { jobId:'B', durationMinutes:45, earliestStart:'2026-06-01T09:00:00+02:00', latestEnd:'2026-06-01T11:00:00+02:00', skill:'audit' },
        { jobId:'C', durationMinutes:30, earliestStart:'2026-06-01T09:00:00+02:00', latestEnd:'2026-06-01T10:30:00+02:00', skill:'install' },
      ], resources:[
        {resource:'Ada',skills:['install','audit'],availableStart:'2026-06-01T07:00:00Z',availableEnd:'2026-06-01T10:00:00Z'},
        {resource:'Bo',skills:['install'],availableStart:'2026-06-01T07:00:00Z',availableEnd:'2026-06-01T10:00:00Z'},
      ]}),
      'readme.txt': 'Scheduling exercise: offsets in the data are intentional.\n',
    },
    oracle: {
      'schedule.json': json([
        {jobId:'A',start:'2026-06-01T09:00:00+02:00',end:'2026-06-01T10:00:00+02:00',resource:'Bo'},
        {jobId:'B',start:'2026-06-01T09:30:00+02:00',end:'2026-06-01T10:15:00+02:00',resource:'Ada'},
        {jobId:'C',start:'2026-06-01T09:00:00+02:00',end:'2026-06-01T09:30:00+02:00',resource:'Ada'},
      ]),
      'schedule-summary.json': json({totalDelayMinutes:30,assignmentCount:3,resourceJobCounts:{Ada:2,Bo:1}}),
    },
    check: `from datetime import datetime, timedelta, timezone
from itertools import product, permutations
jobs = json.loads((root/'jobs.json').read_text())
rows = json.loads((root/'schedule.json').read_text())
assert isinstance(rows,list) and len(rows)==len(jobs['jobs'])
assert all(type(x) is dict and set(x)=={'jobId','start','end','resource'} for x in rows)
byid={j['jobId']:j for j in jobs['jobs']}; assert len({r['jobId'] for r in rows})==len(rows) and set(byid)=={r['jobId'] for r in rows}
resources={r['resource']:r for r in jobs['resources']}
parsed=[]
for r in rows:
    j=byid[r['jobId']]; res=resources[r['resource']]
    start=datetime.fromisoformat(r['start']); end=datetime.fromisoformat(r['end'])
    earliest=datetime.fromisoformat(j['earliestStart']); latest=datetime.fromisoformat(j['latestEnd'])
    assert start.utcoffset() is not None and end.utcoffset() is not None
    assert start.astimezone(timezone.utc).second==0 and start.microsecond==0
    assert res['resource'] in resources and j['skill'] in res['skills']
    assert (end-start).total_seconds()==j['durationMinutes']*60
    assert start >= earliest and end <= latest
    avs=datetime.fromisoformat(res['availableStart'].replace('Z','+00:00')); ave=datetime.fromisoformat(res['availableEnd'].replace('Z','+00:00'))
    assert start.astimezone(avs.tzinfo)>=avs and end.astimezone(ave.tzinfo)<=ave
    parsed.append((r['resource'],start.astimezone(__import__('datetime').timezone.utc),end.astimezone(__import__('datetime').timezone.utc)))
for i,(res,s,e) in enumerate(parsed):
    for res2,s2,e2 in parsed[i+1:]:
        if res==res2: assert e<=s2 or e2<=s
utc=lambda value:datetime.fromisoformat(value).astimezone(timezone.utc)
job_list=jobs['jobs']; best=None
# Enumerate resource assignments and orders, not a hardcoded reference schedule.
for assignment in product(*[[r for r in jobs['resources'] if j['skill'] in r['skills']] for j in job_list]):
    for order in permutations(range(len(job_list))):
        ends={r['resource']:utc(r['availableStart']) for r in jobs['resources']}; starts={}; feasible=True
        for index in order:
            job=job_list[index]; resource=assignment[index]
            start=max(utc(job['earliestStart']),ends[resource['resource']]); end=start+timedelta(minutes=job['durationMinutes'])
            if end>min(utc(job['latestEnd']),utc(resource['availableEnd'])):
                feasible=False; break
            starts[index]=start; ends[resource['resource']]=end
        if feasible:
            candidate=(sum((starts[i]-utc(job['earliestStart'])).total_seconds()/60 for i,job in enumerate(job_list)),tuple(r['resource'] for r in assignment),tuple(starts[i] for i in range(len(job_list))))
            if best is None or candidate<best: best=candidate
by_output={r['jobId']:r for r in rows}
actual=(sum((utc(by_output[j['jobId']]['start'])-utc(j['earliestStart'])).total_seconds()/60 for j in job_list),tuple(by_output[j['jobId']]['resource'] for j in job_list),tuple(utc(by_output[j['jobId']]['start']) for j in job_list))
assert actual==best, 'schedule must minimize delay before applying the declared tie-breaks'
summary=json.loads((root/'schedule-summary.json').read_text())
assert summary=={'totalDelayMinutes':actual[0],'assignmentCount':len(rows),'resourceJobCounts':{name:sum(r['resource']==name for r in rows) for name in resources}}
assert type(summary['assignmentCount']) is int and all(type(n) is int for n in summary['resourceJobCounts'].values())
assert (root/'jobs.json').read_text()==${JSON.stringify(json({jobs:[{jobId:'A',durationMinutes:60,earliestStart:'2026-06-01T09:00:00+02:00',latestEnd:'2026-06-01T12:00:00+02:00',skill:'install'},{jobId:'B',durationMinutes:45,earliestStart:'2026-06-01T09:00:00+02:00',latestEnd:'2026-06-01T11:00:00+02:00',skill:'audit'},{jobId:'C',durationMinutes:30,earliestStart:'2026-06-01T09:00:00+02:00',latestEnd:'2026-06-01T10:30:00+02:00',skill:'install'}],resources:[{resource:'Ada',skills:['install','audit'],availableStart:'2026-06-01T07:00:00Z',availableEnd:'2026-06-01T10:00:00Z'},{resource:'Bo',skills:['install'],availableStart:'2026-06-01T07:00:00Z',availableEnd:'2026-06-01T10:00:00Z'}]}))}
assert (root/'readme.txt').read_text() == 'Scheduling exercise: offsets in the data are intentional.\\n'
assert sorted(p.name for p in root.iterdir()) == ['jobs.json','readme.txt','schedule-summary.json','schedule.json']`,
  },
  {
    id: 'correspondence-triage-actions', category: 'administrative-triage', domain: 'correspondence-triage',
    requiredCapabilities: ['single-turn', 'filesystem'],
    instruction: 'Triage each message in inbox.json using triage-policy.json. Write triage.json as an array in original order; each object exactly {messageId, category, priority, dueDate, draftReply}. Apply the explicit category and priority rules; use null for dueDate when none is explicit. For draftReply, select the appropriate supplied template and render it verbatim with only supported message facts; do not add commitments, addresses, names, times or extra prose. Write summary.json with exactly {categoryCounts, priorityCounts}, each mapping every listed category or priority to its integer count, including zero counts. Preserve inbox.json, triage-policy.json and notes.txt byte-for-byte.',
    files: {
      'inbox.json': json([
        {messageId:'M-1',from:'Ivo',subject:'Invoice 884',body:'Attached invoice for $240 due 2026-07-12. Please confirm receipt.'},
        {messageId:'M-2',from:'Nia',subject:'Meeting',body:'Can we move Tuesday meeting to Thursday? No time specified.'},
        {messageId:'M-3',from:'Omar',subject:'Question',body:'What is the current office mailing address?'},
        {messageId:'M-4',from:'Paz',subject:'Invoice correction',body:'Invoice 885 total is $90; please correct the recipient name. We need this before 2026-07-10.'},
      ]), 'triage-policy.json':json(triagePolicy), 'notes.txt':unchanged,
    },
    oracle: { 'triage.json': json([
      {messageId:'M-1',category:'invoice',priority:'normal',dueDate:'2026-07-12',draftReply:'Thanks for your message about invoice 884 for $240, due 2026-07-12.'},
      {messageId:'M-2',category:'scheduling',priority:'normal',dueDate:null,draftReply:'What time on Thursday are you proposing? The meeting change is not yet confirmed.'},
      {messageId:'M-3',category:'information',priority:'low',dueDate:null,draftReply:'Which office location do you mean? I do not have a confirmed mailing address.'},
      {messageId:'M-4',category:'invoice',priority:'high',dueDate:'2026-07-10',draftReply:'What is the correct recipient name for invoice 885 ($90)? You requested this before 2026-07-10.'},
    ]), 'summary.json':json({categoryCounts:{invoice:2,scheduling:1,information:1},priorityCounts:{high:1,normal:2,low:1}}) },
    check: `import re
messages=json.loads((root/'inbox.json').read_text()); rows=json.loads((root/'triage.json').read_text())
policy=json.loads((root/'triage-policy.json').read_text())
assert isinstance(rows,list) and len(rows)==len(messages)
assert all(type(r) is dict and set(r)=={'messageId','category','priority','dueDate','draftReply'} for r in rows)
for row,message in zip(rows,messages):
    text=message['subject']+' '+message['body']; lower=text.lower()
    date=re.search(r'\\d{4}-\\d{2}-\\d{2}',text)
    due=date.group() if date else None
    category='invoice' if 'invoice' in lower else 'scheduling' if 'meeting' in lower else 'information'
    correction=category=='invoice' and 'recipient' in lower and 'correct' in lower
    priority='high' if correction and due else 'low' if category=='information' and not due else 'normal'
    assert (row['messageId'],row['category'],row['priority'],row['dueDate'])==(message['messageId'],category,priority,due)
    facts={}
    if category=='invoice':
        facts={'invoiceId':re.search(r'invoice\\s+(\\d+)',text,re.I).group(1),'amountUsd':re.search(r'\\$([0-9]+(?:\\.[0-9]{2})?)',text).group(1),'dueDate':due}
    elif category=='scheduling':
        facts={'proposedDay':re.search(r'\\bto (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)',text).group(1)}
    template='recipientCorrection' if correction else category
    assert row['draftReply']==policy['templates'][template].format(**facts), 'reply must use the supplied template and source-supported values only'
summary=json.loads((root/'summary.json').read_text())
expected_counts={'categoryCounts':{key:sum(row['category']==key for row in rows) for key in policy['categories']},'priorityCounts':{key:sum(row['priority']==key for row in rows) for key in policy['priorities']}}
assert summary==expected_counts
assert all(type(n) is int for counts in summary.values() for n in counts.values())
assert (root/'triage-policy.json').read_text()==${JSON.stringify(json(triagePolicy))}
assert (root/'inbox.json').read_text()==${JSON.stringify(json([{messageId:'M-1',from:'Ivo',subject:'Invoice 884',body:'Attached invoice for $240 due 2026-07-12. Please confirm receipt.'},{messageId:'M-2',from:'Nia',subject:'Meeting',body:'Can we move Tuesday meeting to Thursday? No time specified.'},{messageId:'M-3',from:'Omar',subject:'Question',body:'What is the current office mailing address?'},{messageId:'M-4',from:'Paz',subject:'Invoice correction',body:'Invoice 885 total is $90; please correct the recipient name. We need this before 2026-07-10.'}]))}
assert (root/'notes.txt').read_text()==${JSON.stringify(unchanged)}
assert sorted(p.name for p in root.iterdir())==['inbox.json','notes.txt','summary.json','triage-policy.json','triage.json']`,
  },
  {
    id: 'privacy-safe-release', category: 'privacy-data', domain: 'privacy-safe-data-release',
    requiredCapabilities: ['single-turn', 'filesystem'],
    instruction: 'Prepare a release-safe version of records.csv as public.csv. Remove direct identifiers and sensitive fields (email, phone, free-text note) entirely; retain record_id, region, age_band, and plan only. Age bands must be exact decade bands (20-29 etc), with under 20 as <20 and 80+ as 80+. Write release-summary.json with exact keys {rowCount, removedColumns, ageBandCounts}; removedColumns is the sorted list of removed field names, counts map age bands to counts. Do not alter source or unrelated.txt.',
    files: {
      'records.csv':'record_id,full_name,email,phone,age,region,plan,note\nP-1,Ada Example,ada@example.test,555-0101,27,North,basic,private medical detail\nP-2,Bo Sample,bo@example.test,555-0102,44,South,premium,account complaint\nP-3,Cy Demo,cy@example.test,555-0103,81,North,basic,personal circumstance\n', 'unrelated.txt':unchanged,
    },
    oracle:{'public.csv':'record_id,region,age_band,plan\nP-1,North,20-29,basic\nP-2,South,40-49,premium\nP-3,North,80+,basic\n','release-summary.json':json({rowCount:3,removedColumns:['age','email','full_name','note','phone'],ageBandCounts:{'20-29':1,'40-49':1,'80+':1}})},
    check:`import csv,io
with (root/'public.csv').open(newline='') as f: rows=list(csv.DictReader(f))
assert list(rows[0])==['record_id','region','age_band','plan'] and len(rows)==3
assert rows==[{'record_id':'P-1','region':'North','age_band':'20-29','plan':'basic'},{'record_id':'P-2','region':'South','age_band':'40-49','plan':'premium'},{'record_id':'P-3','region':'North','age_band':'80+','plan':'basic'}]
s=json.loads((root/'release-summary.json').read_text()); assert type(s) is dict and set(s)=={'rowCount','removedColumns','ageBandCounts'}
assert s=={'rowCount':3,'removedColumns':['age','email','full_name','note','phone'],'ageBandCounts':{'20-29':1,'40-49':1,'80+':1}}
assert (root/'records.csv').read_text()==${JSON.stringify('record_id,full_name,email,phone,age,region,plan,note\nP-1,Ada Example,ada@example.test,555-0101,27,North,basic,private medical detail\nP-2,Bo Sample,bo@example.test,555-0102,44,South,premium,account complaint\nP-3,Cy Demo,cy@example.test,555-0103,81,North,basic,personal circumstance\n')}
assert (root/'unrelated.txt').read_text()==${JSON.stringify(unchanged)}
assert sorted(p.name for p in root.iterdir())==['public.csv','records.csv','release-summary.json','unrelated.txt']`,
  },
  {
    id:'service-contingency-decision',category:'operational-planning',domain:'operational-constraints-contingencies',requiredCapabilities:['single-turn','filesystem'],
    instruction:'Use constraints.json to choose exactly one action in decision.json with exactly {action, rationale, contingency}. Optimize the stated score subject to hard constraints; never choose a prohibited action. The rationale must be a structured object with exactly {capacityUnits, usedUnits, requiredCondition, excludedHigherScoringActions}: copy the selected action and capacity facts, and list in alphabetical order all higher-scoring actions that violate a hard constraint. Do not substitute free-form prose for these fields. Give the specified contingency if the chosen action is unavailable. Preserve constraints.json and notes.txt byte-for-byte.',
    files:{'constraints.json':json({capacityUnits:80,actions:[{action:'divert',score:9,units:70,requires:'route open'},{action:'hold',score:5,units:20,requires:'staff available'},{action:'cancel',score:1,units:0,requires:'none'}],prohibited:['divert'],conditions:{'route open':false,'staff available':true},contingency:{hold:'notify dispatch and reassess in 30 minutes',cancel:'none'}}),'notes.txt':unchanged},
    oracle:{'decision.json':json({action:'hold',rationale:{capacityUnits:80,usedUnits:20,requiredCondition:'staff available',excludedHigherScoringActions:['divert']},contingency:'notify dispatch and reassess in 30 minutes'})},
    check:`d=json.loads((root/'constraints.json').read_text()); r=json.loads((root/'decision.json').read_text())
assert type(r) is dict and set(r)=={'action','rationale','contingency'}
def feasible(action):
    return action['action'] not in d['prohibited'] and action['units']<=d['capacityUnits'] and (action['requires']=='none' or d['conditions'].get(action['requires']) is True)
choices=[action for action in d['actions'] if feasible(action)]
a=next(x for x in d['actions'] if x['action']==r['action'])
assert feasible(a) and a['score']==max(action['score'] for action in choices)
assert r['rationale']=={'capacityUnits':d['capacityUnits'],'usedUnits':a['units'],'requiredCondition':a['requires'],'excludedHigherScoringActions':sorted(action['action'] for action in d['actions'] if action['score']>a['score'] and not feasible(action))}
assert r['contingency']==d['contingency'][r['action']]
assert (root/'constraints.json').read_text()==${JSON.stringify(json({capacityUnits:80,actions:[{action:'divert',score:9,units:70,requires:'route open'},{action:'hold',score:5,units:20,requires:'staff available'},{action:'cancel',score:1,units:0,requires:'none'}],prohibited:['divert'],conditions:{'route open':false,'staff available':true},contingency:{hold:'notify dispatch and reassess in 30 minutes',cancel:'none'}}))}
assert (root/'notes.txt').read_text()==${JSON.stringify(unchanged)}
assert sorted(p.name for p in root.iterdir())==['constraints.json','decision.json','notes.txt']`,
  },
  {
    id:'stock-allocation-with-reserve',category:'operational-planning',domain:'constrained-resource-allocation',requiredCapabilities:['single-turn','filesystem'],
    instruction:'Allocate stock.json inventory to orders.json in priority order, honoring each order as all-or-nothing and keeping the required reserve untouched. Write allocation.json with exactly {allocations, remaining, reservePreserved}; allocations is an array of exactly {orderId, units} in order-file order, including zero for unfilled orders. Define remaining as unused allocatable stock: subtract the protected reserve before allocation, so remaining excludes the reserve. Maximize priority served lexicographically by input order; never exceed stock. Preserve both inputs and note.txt byte-for-byte.',
    files:{'stock.json':json({sku:'FILTER-A',available:20,reserve:4}),'orders.json':json([{orderId:'O-1',units:10},{orderId:'O-2',units:6},{orderId:'O-3',units:5}]),'note.txt':unchanged},
    oracle:{'allocation.json':json({allocations:[{orderId:'O-1',units:10},{orderId:'O-2',units:6},{orderId:'O-3',units:0}],remaining:0,reservePreserved:true})},
    check:`stock=json.loads((root/'stock.json').read_text()); orders=json.loads((root/'orders.json').read_text()); result=json.loads((root/'allocation.json').read_text())
assert type(result) is dict and set(result)=={'allocations','remaining','reservePreserved'}
a=result['allocations']; assert isinstance(a,list) and len(a)==len(orders)
assert all(type(x) is dict and set(x)=={'orderId','units'} for x in a)
assert [(x['orderId'],x['units']) for x in a]==[('O-1',10),('O-2',6),('O-3',0)]
assert result['reservePreserved'] is True and result['remaining']==0
assert sum(x['units'] for x in a)+result['remaining']==stock['available']-stock['reserve']
assert all(x['units'] in (0,order['units']) for x,order in zip(a,orders))
assert (root/'stock.json').read_text()==${JSON.stringify(json({sku:'FILTER-A',available:20,reserve:4}))}
assert (root/'orders.json').read_text()==${JSON.stringify(json([{orderId:'O-1',units:10},{orderId:'O-2',units:6},{orderId:'O-3',units:5}]))}
assert (root/'note.txt').read_text()==${JSON.stringify(unchanged)}
assert sorted(p.name for p in root.iterdir())==['allocation.json','note.txt','orders.json','stock.json']`,
  },
];

// WHY: the verifier's side-effect policy must be visible, not an undisclosed penalty.
for(const task of heldoutCases){
 task.instruction+=' Create only the named output files; do not leave scripts, scratch files or other new files in the working directory.';
 // WHY: read_text normalizes line endings; source preservation requires exact UTF-8 bytes, independently of semantic output checks.
 task.check+='\n'+Object.entries(task.files).map(([name,text])=>`assert (root/${JSON.stringify(name)}).read_bytes() == bytes.fromhex('${Buffer.from(text,'utf8').toString('hex')}'), 'preserved input bytes changed'`).join('\n');
}
