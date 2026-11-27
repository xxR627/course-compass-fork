import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCourseCompassServer } from './_serve.mjs';
import { assertEmploymentShape } from './_employment-contract.mjs';
import { readEmploymentData, writeEmploymentFile } from './_employment-data.mjs';
import { researchEmploymentGrowth } from './_employment-growth.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let offlineReview=false;
const growthLookups=[];
const llmCalls=[];
let badGrowthOutput=false;
let offlineGrowth=false;
const catalogDirectory=mkdtempSync(join(tmpdir(),'cc-catalog-api-'));
const catalogFile=pathToFileURL(join(catalogDirectory,'catalog.json'));
const catalog=readEmploymentData();
writeEmploymentFile(catalogFile,JSON.stringify(catalog));
const server = createCourseCompassServer({
  catalogFile,
  model:'qwen3.8-27b-local:latest',
  liveFetcher:async (address)=>{
    const url=String(address);
    if(url.includes('join.qq.com/api/v1/position')){
      return Response.json({status:0,data:{positionList:[{postId:'e2e_fw_001',positionTitle:'固件工程师',tidName:'技术',projectName:'2027届校招',workCities:'苏州,上海'}]}});
    }
    if(url.includes('join.qq.com/api/v1/jobDetails')){
      return Response.json({status:0,data:{postId:'e2e_fw_001',title:'固件工程师',tidName:'技术',projectName:'2027届校招',workCityList:['苏州','上海'],desc:'【岗位职责】\n开发固件。',request:'熟悉 STM32 和 CAN 总线。'}});
    }
    if(url.includes('smartrecruiters.com')) return Response.json({content:[]});
    if(url.includes('greenhouse.io')) return Response.json({jobs:[]});
    return new Response(null,{status:404});
  },
  llmFetcher:async (address,options)=>{
    const url=new URL(address);
    if(url.pathname==='/api/tags'){
      return Response.json({models:[
        {name:'qwen3.8-27b-local:latest',details:{parameter_size:'27B',quantization_level:'Q3_K_L'}},
        {name:'qwen3.5-9b-local:latest',details:{parameter_size:'9B',quantization_level:'Q4_K_M'}},
      ]});
    }
    if(url.pathname==='/api/ps') return Response.json({models:[{name:'qwen3.8-27b-local:latest'}]});
    if(url.pathname==='/api/generate') return Response.json({done:true});
    assert.equal(url.pathname,'/api/chat');
    const body=JSON.parse(options.body);
    llmCalls.push(body);
    assert.equal(body.think,false);
    assert.equal(body.options.num_ctx,3072);
    assert.doesNotMatch(JSON.stringify(body),/E2E_PRIVATE_SCHOOL|PRIVATE_NAME|13800138000|secret@example\.com/);
    const sys=body.messages[0].content;
    let reply='【综合研判】\n八维字段硬门槛核对清晰，建议重点准备核心工程项目。\n【语义契合与隐含要求】\n- 注重工程落地与联调闭环\n【有据简历定制改写】\n- 完成机电控制模块联调，故障定位耗时缩短 [待补充实测数据]\n【针对性面试追问】\n- 请说明一次软硬件联调排障的完整链路？\n【两周冲刺补短板】\n- 整理一份包含实测日志的最小复现仓库';
    if(sys.includes('JD 深度拆解助手')){
      reply='【岗位定位】\n面向工程研发与测试联调的核心技术岗。\n【核心硬门槛】\n- 相关工科专业背景\n【加分亮点】\n- 有实际模块开发记录\n【注意事项】\n- 投递前核对最新招聘状态与出勤周期';
    }else if(sys.includes('选岗对比参谋')){
      reply='【选岗优先序】\n优先投递职责更聚焦、来源更明确的首选岗位。\n【关键差异权衡】\n- 两岗在城市与核心技术侧重上存在互补\n【投递策略】\n- 按岗位核心词分别微调简历首屏项目';
    }else if(sys.includes('经历证据化助手')){
      reply='【项目化定位】\n课程实验转化为可复现的工程验证项目。\n【有据简历要点】\n- 独立完成核心模块实验验证，关键指标提升 [待补充实测数据]\n【强化动作】\n- 补齐实验对比数据表与复现说明\n【求职提示】\n- 面试常追问本人独立负责的边界';
    }
    if(!body.stream) return Response.json({message:{content:reply}});
    const chunks=[reply.slice(0,22),reply.slice(22)].map(piece=>JSON.stringify({message:{content:piece}})+'\n');
    return new Response(new ReadableStream({
      start(controller){
        const enc=new TextEncoder();
        for(const chunk of chunks) controller.enqueue(enc.encode(chunk));
        controller.close();
      },
    }),{status:200,headers:{'Content-Type':'application/x-ndjson'}});
  },
  growth:async input=>researchEmploymentGrowth({...input,fetcher:async (address,options)=>{
    const url=new URL(address);
    growthLookups.push(url.href);
    assert.doesNotMatch(url.href,/PRIVATE_|student|resume/);
    if(url.hostname==='api.github.com'&&offlineGrowth) return new Response(null,{status:429});
    if(url.hostname==='api.crossref.org'&&offlineGrowth) throw new TypeError('fixture connection reset');
    if(url.hostname==='api.github.com') return Response.json({items:[{full_name:'fixture/embedded-samples',
      description:'Firmware and validation exercises',license:{spdx_id:'MIT'}}]});
    if(url.hostname==='api.crossref.org') return Response.json({message:{items:[{
      DOI:'10.1234/test',title:['Embedded validation methods'],published:{'date-parts':[[2025]]},
    }]}});
    assert.equal(url.origin,'http://127.0.0.1:11434');
    const request=JSON.parse(options.body);
    assert.doesNotMatch(JSON.stringify(request),/PRIVATE_|example.com\/private/);
    return Response.json({message:{content:JSON.stringify({projectId:badGrowthOutput?'not-registered':'repo-1',paperId:'paper-1',
      nextAction:'搭建一个最小工程并记录结果。',verification:'提交可复现日志和一个边界用例。'})}});
  }}),
  review:async (projection)=>{
    if(offlineReview) throw new Error('MODEL_UNAVAILABLE');
    assert.equal(projection.criteria.length,2);
    assert.match(projection.excerpt,/指定 ID 321 收发一致/);
    assert.doesNotMatch(projection.excerpt,/PRIVATE_NAME|example\.com/);
    return {findings:[
      {index:0,assessment:'supports',quote:'指定 ID 321 收发一致'},
      {index:1,assessment:'unclear',quote:''},
    ]};
  },
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  const reviewEndpoint=origin+'/api/employment/evidence-review';
  const foreign=await fetch(reviewEndpoint,{
    method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com','Sec-Fetch-Site':'cross-site'},body:'{}',
  });
  assert.equal(foreign.status,403);
  const foreignLlm=await fetch(origin+'/api/employment/llm/match-copilot',{
    method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com','Sec-Fetch-Site':'cross-site'},body:'{}',
  });
  assert.equal(foreignLlm.status,403);
  const qoderPublic=await fetch(origin+'/api/employment/llm/match-copilot',{
    method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-Host':'demo.qoder.site',Origin:'https://demo.qoder.site','Sec-Fetch-Site':'same-origin'},
    body:JSON.stringify({title:'固件工程师',org:'测试企业',jdText:'熟悉 STM32 和 CAN 总线。',stream:false}),
  });
  assert.equal(qoderPublic.status,200);
  const liveSyncRes=await (await fetch(origin+'/api/employment/live/sync',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({sources:['tencent'],limit:2}),
  })).json();
  assert.equal(liveSyncRes.ok,true);
  assert.equal(liveSyncRes.items[0].id,'live_tx_e2e_fw_001');
  const whSearchRes=await (await fetch(origin+'/api/employment/warehouse/search?q=Java&limit=3')).json();
  assert.equal(whSearchRes.ok,true);
  assert.ok(whSearchRes.items.length>0);
  const calRes=await (await fetch(origin+'/api/employment/calendar?limit=5')).json();
  assert.equal(calRes.ok,true);
  assert.ok(calRes.items.length>0);
  const llmStatus=await (await fetch(origin+'/api/employment/llm/status')).json();
  assert.equal(llmStatus.available,true);
  assert.equal(llmStatus.activeModel,'qwen3.8-27b-local:latest');
  const workspaceFile=await fetch(origin+'/_cc-data.json');
  assert.equal(workspaceFile.status,404);
  const listUrl=origin+'/employment/jobs';
  const filtered=await fetch(listUrl+'?type=intern&company='+encodeURIComponent('普渡机器人')+'&limit=2');
  const pageOne=await filtered.json();
  assert.equal(filtered.status,200);
  assertEmploymentShape('PublicJobListResponse',pageOne);
  for(const header of ['x-employment-schema-version','x-match-algorithm-version','x-taxonomy-version'])
    assert.ok(filtered.headers.get(header));
  assert.equal(filtered.headers.get('x-employment-snapshot'),pageOne.snapshot);
  assert.ok(pageOne.total>=3);
  assert.ok(pageOne.items.every(item=>item.org==='普渡机器人'&&item.jobType==='intern'&&!Object.hasOwn(item,'jdText')));
  const hardware=await (await fetch(listUrl+'?direction=hardware&family=circuits')).json();
  assertEmploymentShape('PublicJobListResponse',hardware);
  assert.ok(hardware.items.some(item=>item.id==='jr_1jjue1m'&&item.familyId==='circuits'));
  const investment=await (await fetch(listUrl+'?direction=finance&family=finance-investment')).json();
  assertEmploymentShape('PublicJobListResponse',investment);
  assert.ok(investment.items.some(item=>item.id==='jr_qzhq8i'&&item.familyId==='finance-investment'));
  const mirrors=['jr_1l85zdf','jr_1fyrogs'];
  const mirrorSearch=await (await fetch(listUrl+'?q='+encodeURIComponent('Agent 开发工程师—人工智能研究院')+'&family=ai-applications')).json();
  assertEmploymentShape('PublicJobListResponse',mirrorSearch);
  assert.equal(mirrorSearch.items.filter(job=>mirrors.includes(job.id)).length,1);
  for(const id of mirrors) assert.equal((await (await fetch(listUrl+'/'+id)).json()).job.id,id);
  const listTwo=await fetch(listUrl+'?type=intern&company='+encodeURIComponent('普渡机器人')+'&offset=2&limit=2&snapshot='+pageOne.snapshot);
  const pageTwo=await listTwo.json();
  assertEmploymentShape('PublicJobListResponse',pageTwo);
  assert.equal(pageTwo.total,pageOne.total);
  assert.ok(pageTwo.items.every(item=>!pageOne.items.some(previous=>previous.id===item.id)));
  const itemUrl=listUrl+'/'+encodeURIComponent(pageOne.items[0].id);
  const posting=await fetch(itemUrl+'?snapshot='+pageOne.snapshot);
  assert.equal(posting.status,200);
  const detail=await posting.json();
  assertEmploymentShape('PublicJobDetailResponse',detail);
  assert.ok(detail.job.jdText.trim());
  assert.equal(detail.job.postUrl,pageOne.items[0].postUrl);
  for(const requirement of detail.job.requirements)
    assert.equal(detail.job.jdText.slice(...requirement.sourceOffset),requirement.textSpan);
  const mealOffer=catalog.jobs.find(job=>job.jdText.includes('食堂餐补300元/月'));
  const noConversionOffer=catalog.jobs.find(job=>job.jdText.includes('暂无法提供转正机会'));
  assert.ok(mealOffer&&noConversionOffer);
  const mealDetail=await (await fetch(listUrl+'/'+encodeURIComponent(mealOffer.id))).json();
  assertEmploymentShape('PublicJobDetailResponse',mealDetail);
  const mealQuote=mealDetail.job.facts.mealsAndHousing[0];
  assert.match(mealQuote.sourceSpan,/提供住宿\+食堂餐补300元\/月/);
  assert.equal(mealDetail.job.jdText.slice(...mealQuote.sourceOffset),mealQuote.sourceSpan);
  const salaries=await fetch(listUrl+'?sort=salary&salaryMin=1&limit=10');
  const salaryItems=(await salaries.json()).items;
  assert.ok(salaryItems.length>1&&salaryItems.every((item,index)=>item.salary&&(!index||item.salary.monthlyMax<=salaryItems[index-1].salary.monthlyMax)));
  for(const query of ['?studentId=private','?limit=0','?direction=embedded&family=backend','?snapshot=invalid','?type=intern&type=campus'])
    assert.equal((await fetch(listUrl+query)).status,400);
  assert.equal((await fetch(listUrl+'/import_private')).status,404);
  assert.equal((await fetch(listUrl,{method:'POST'})).status,405);
  const head=await fetch(listUrl,{method:'HEAD'});
  assert.equal(head.headers.get('x-employment-snapshot'),pageOne.snapshot);
  assert.equal(await head.text(),'');
  const matchUrl=origin+'/employment/matches/query';
  const matchInput={snapshot:pageOne.snapshot,jobIds:pageOne.items.map(item=>item.id),limit:2};
  const queryMatch=(value,extraHeaders={})=>fetch(matchUrl,{method:'POST',
    headers:{'Content-Type':'application/json',...extraHeaders},body:JSON.stringify(value)});
  assert.equal((await queryMatch(matchInput,{Origin:'https://example.com','Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await queryMatch({...matchInput,studentId:'private'})).status,400);
  const changed=catalog.jobs.find(job=>job.id===pageOne.items[0].id);
  changed.title+='（接口测试用）';
  writeEmploymentFile(catalogFile,JSON.stringify(catalog));
  assert.equal((await fetch(itemUrl+'?snapshot='+pageOne.snapshot)).status,409);
  const updated=await (await fetch(itemUrl)).json();
  assert.equal(updated.job.title,changed.title);
  assert.notEqual(updated.snapshot,pageOne.snapshot);
  writeEmploymentFile(catalogFile,'{}');
  assert.equal((await fetch(listUrl)).status,503);
  writeEmploymentFile(catalogFile,JSON.stringify(readEmploymentData()));
  assert.equal((await fetch(listUrl)).status,200);
  browser = await chromium.launch({ executablePath: process.env.CC_BROWSER_PATH });
  const page = await browser.newPage({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  await page.route('**/*', route => route.request().url().startsWith(origin + '/')
    ? route.continue()
    : route.fulfill({ status: 200, body: '' }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (offlineReview && message.location().url===origin+'/api/employment/evidence-review' &&
        message.type()==='error' && message.text().includes('503')) return;
    if (message.type() === 'error') errors.push(message.text());
  });
  const savedState = () => page.evaluate(() => JSON.parse(localStorage.getItem('course-compass-v1')));
  const jobsTab = page.locator('.nav-item[data-module="jobs"]');
  const cards = page.locator('.cc-job-card');

  await page.goto(origin);
  const compared=await page.evaluate(async request=>{
    const profile=CC.ccProfileFromState({profile:{major:'计算机',degree:'bachelor',graduationDate:'2027-06',gpa:0,school:'PRIVATE_SCHOOL',
      evidences:[{id:'PRIVATE_ID',type:'项目',title:'PRIVATE_TITLE',description:'PRIVATE_DESCRIPTION',
        artifactUrl:'https://example.com/private',skillIds:['python','git_collab'],verificationStatus:'user_confirmed',observedAt:'2026-10-01'}]},
      jobs:{preferences:{cities:['深圳','PRIVATE_CITY'],salaryMin:5000}}});
    const normalized=CC.projectEmploymentMatchProfile(profile);
    const value={...request,profile:normalized};
    const response=await fetch('/employment/matches/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
    const body=await response.json();
    const expected=CC.forwardMatch(profile,request.jobIds.map(id=>CC.REQ_BY_ID.get(id)),new Date(body.asOf)).all;
    const noPersonalization=CC.projectEmploymentMatchProfile({...profile,personalized:false});
    return {status:response.status,body,value,noPersonalization,
      expected:expected.map(({req,matchScore,confidence,factors,eligibility,tier,tierReason})=>({id:req.id,matchScore,confidence,factors,eligibility,tier,tierReason}))};
  },matchInput);
  assert.equal(compared.status,200);
  assertEmploymentShape('MatchQueryResponse',compared.body);
  assert.doesNotMatch(JSON.stringify(compared.value),/PRIVATE_|example.com/);
  assert.equal(compared.noPersonalization.degree,null);
  assert.equal(compared.noPersonalization.evidences.length,0);
  assert.deepEqual(compared.body.items.map(({req,matchScore,confidence,factors,eligibility,tier,tierReason})=>
    ({id:req.id,matchScore,confidence,factors,eligibility,tier,tierReason})),compared.expected);
  assert.equal((await queryMatch({...compared.value,jobIds:['import_private']})).status,404);
  assert.equal((await queryMatch({...compared.value,snapshot:'0'.repeat(64)})).status,409);
  assert.equal((await queryMatch({...compared.value,profile:{...compared.value.profile,school:'PRIVATE_SCHOOL'}})).status,400);
  assert.equal((await queryMatch({...compared.value,profile:{...compared.value.profile,preferences:{...compared.value.profile.preferences,cities:['PRIVATE_CITY']}}})).status,400);
  const neutral=await (await queryMatch({...compared.value,profile:compared.noPersonalization})).json();
  assert.ok(neutral.items.every(item=>item.matchScore===null));
  await jobsTab.click();
  await page.locator('[data-action="cc-persona"]').first().click();
  assert.deepEqual(errors, [], 'Loading a persona should render without an exception');
  await cards.first().waitFor();
  assert.ok((await savedState()).profile.saved, 'Loading a persona should persist the profile');

  await page.locator('.cc-employment-nav [data-mode="list"]').click();
  const leadSection=page.locator('details[aria-label="手动岗位线索"]');
  const leads=page.locator('#cc-lead-form'), leadInput=leads.getByRole('textbox');
  const openLeadSection=async()=>{
    if(!await leadSection.count()) await page.locator('[data-action="cc-live-panel"]').first().click();
    await page.locator('#cc-warehouse-form button[type="submit"]:not([disabled])').waitFor();
    if(!await leadSection.evaluate(node=>node.open)) await leadSection.locator('summary').click();
  };
  await openLeadSection();
  assert.ok(await leadSection.getByText('分享的招聘线索',{exact:true}).isVisible());
  assert.equal(await leadSection.getByRole('link',{name:'打开网址',exact:false}).count(),3);
  const puduLead=leadSection.locator('li').filter({hasText:'普渡机器人'});
  await puduLead.getByRole('button',{name:'查看该企业的岗位快照',exact:false}).click();
  await cards.first().waitFor();
  assert.equal((await savedState()).jobs.filters.company,'普渡机器人');
  assert.ok(await cards.filter({hasText:'多模态深度学习算法实习生'}).first().isVisible());
  assert.ok((await cards.allTextContents()).every(text=>text.includes('普渡机器人')));
  await openLeadSection();
  await leadInput.fill('招聘岗位\t网址\n测试岗位\thttps://example.com/job\n错误岗位\tjavascript:alert(1)');
  await leads.getByRole('button',{name:'添加到本机'}).click();
  assert.equal((await savedState()).jobs.personalLeads,undefined);
  await leadInput.fill('招聘岗位\t网址\n测试岗位\thttps://example.com/job\n测试岗位\thttps://example.com/job');
  await leads.getByRole('button',{name:'添加到本机'}).click();
  assert.equal((await savedState()).jobs.personalLeads.length,1);
  await page.reload();
  await openLeadSection();
  assert.ok(await page.getByText('测试岗位',{exact:true}).isVisible());
  await page.getByRole('button',{name:'移除',exact:true}).click();
  assert.equal((await savedState()).jobs.personalLeads.length,0);
  await page.locator('[data-action="cc-live-panel"]').first().click();
  await page.locator('[data-action="cc-reset-filters"]').first().click();
  await page.locator('.cc-employment-nav [data-mode="home"]').click();

  await page.locator('.nav-item[data-module="dash"]').click();
  await jobsTab.click();
  await cards.first().waitFor();
  await page.locator('.cc-employment-nav [data-mode="list"]').click();
  await page.locator('[data-action="cc-filter"][data-f="exp"][data-k="实习"]').click();
  await page.locator('#cc-job-search').fill('项目');
  await page.locator('#cc-job-search').press('Enter');
  await cards.first().waitFor();
  const cardCount = await cards.count();
  const details = cards.first().locator('.cc-job-actions [data-action="cc-open-job"]');
  const jobId = await details.getAttribute('data-id');
  await details.click();
  await page.locator('[data-action="cc-close-job"]').waitFor();
  const target = page.locator('button[data-action="cc-target"]');
  if ((await savedState()).jobs.targetReqIds.includes(jobId)) await target.click();
  await target.click();
  assert.ok((await savedState()).jobs.targetReqIds.includes(jobId));
  assert.ok(await page.getByRole('region', { name: '联网成长规划' }).isVisible());
  const growthPage=await browser.newPage({locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  growthPage.on('pageerror',error=>errors.push(error.message));
  await growthPage.route('**/*',route=>route.request().url().startsWith(origin+'/')
    ?route.continue():route.fulfill({status:200,body:''}));
  const firmware=await page.evaluate(()=>CC.DATA.jobs.find(job=>CC.jobFamilyOf(job)?.id==='firmware')?.id);
  assert.ok(firmware);
  await growthPage.goto(origin+'/#jobs/family/firmware/job/'+firmware);
  await growthPage.getByRole('button',{name:'成长路线',exact:true}).click();
  const growthPanel=growthPage.getByRole('region',{name:'联网成长规划'});
  const contestList=growthPanel.locator('[data-contest-reference]');
  await contestList.getByText('赛事参考名单 · 91 项',{exact:true}).click();
  await contestList.getByRole('searchbox',{name:'搜索赛事'}).fill('全国供应链大赛');
  assert.equal(await contestList.getByRole('status').textContent(),'1 项');
  assert.ok(await contestList.getByText('全国供应链大赛 · 未标注',{exact:true}).isVisible());
  await contestList.getByRole('combobox',{name:'名单标注'}).selectOption('B');
  assert.equal(await contestList.getByRole('status').textContent(),'0 项');
  await contestList.locator('summary').click();
  await growthPanel.getByRole('button',{name:'搜索并生成规划'}).click();
  await growthPanel.getByText('规划已更新。你可以切换技能重点再生成。',{exact:true}).waitFor();
  assert.deepEqual(await growthPanel.locator('ol.cc-growth-results > li > h3').allTextContents(),[
    '岗位与资格','优先补齐的技能','动手项目','竞赛与招聘依据','岗位样本需求与论文方向','下一步与验收',
  ]);
  assert.ok(await growthPanel.getByText('搭建一个最小工程并记录结果。',{exact:true}).isVisible());
  assert.ok(await growthPanel.getByText('本轮论文方向',{exact:true}).isVisible());
  const embeddedContest=growthPanel.getByRole('link',{name:/全国大学生嵌入式芯片与系统设计竞赛/}).first();
  assert.equal(await embeddedContest.getAttribute('href'),'https://www.socchina.net/wx/home?trackType=1');
  const topicBreakdown=growthPanel.getByText(/^固件、实时系统与通信 · .*要求表述/);
  await topicBreakdown.click();
  const topicEvidence=topicBreakdown.locator('..').locator('blockquote').first();
  const topicQuote=await topicEvidence.textContent();
  assert.ok(await growthPage.evaluate(raw=>CC.DATA.jobs.some(job=>job.jdText.includes(raw)),topicQuote));
  assert.equal(await growthPanel.getByRole('link',{name:'fixture/embedded-samples',exact:false}).getAttribute('href'),'https://github.com/fixture/embedded-samples');
  const proof=growthPanel.getByText(/查看 .* 的 JD 依据/).first();
  await proof.click();
  const quote=await proof.locator('..').locator('blockquote').first().textContent();
  assert.ok(await growthPage.evaluate(({firmware,quote})=>CC.JOB_BY_ID.get(firmware).jdText.includes(quote),{firmware,quote}));
  await growthPanel.getByRole('button',{name:'打开对应实战任务',exact:false}).click();
  const openedTask=growthPage.getByRole('region',{name:'实战成长任务'}).locator('[data-roadmap-task][open]');
  assert.equal(await openedTask.count(),1);
  assert.ok(await openedTask.getByRole('button',{name:'保存复核材料'}).isVisible());
  assert.ok(await openedTask.getByText(/两周.*另计补先修的时间/).isVisible());
  const focus=growthPanel.getByRole('combobox',{name:'本轮优先技能'});
  await focus.selectOption('embedded_c');
  badGrowthOutput=true;
  await growthPanel.getByRole('button',{name:'搜索并生成规划'}).click();
  await growthPanel.getByText(/规则生成/).waitFor();
  assert.equal(growthLookups.filter(url=>url.startsWith('https:')).length,4);
  const queries=growthLookups.map(url=>new URL(url));
  assert.match(queries.filter(url=>url.hostname==='api.github.com')[1].searchParams.get('q'),/^embedded C driver/);
  const paperQueries=queries.filter(url=>url.hostname==='api.crossref.org').map(url=>url.searchParams.get('query.bibliographic'));
  assert.equal(paperQueries[0],paperQueries[1]);
  assert.ok(!(await growthPage.evaluate(()=>localStorage.getItem('course-compass-v1'))).includes('fixture/embedded-samples'));
  offlineGrowth=true;
  await growthPanel.getByRole('button',{name:'搜索并生成规划'}).click();
  await growthPanel.getByText(/GitHub 请求受限.*Crossref 连接失败/).waitFor();
  assert.ok(await growthPanel.getByText(/Crossref 连接失败。本轮可先使用实战任务与岗位原文/).isVisible());
  offlineGrowth=false;
  badGrowthOutput=false;
  await growthPanel.getByRole('button',{name:'搜索并生成规划'}).click();
  await growthPanel.getByText('搭建一个最小工程并记录结果。',{exact:true}).waitFor();
  const projectEntry=growthPanel.getByRole('link',{name:'fixture/embedded-samples',exact:false}).locator('..');
  await projectEntry.getByRole('button',{name:'采用此项目',exact:true}).click();
  const storedGrowth=()=>growthPage.evaluate(()=>JSON.parse(localStorage.getItem('course-compass-v1')).jobs);
  const planId='roadmap-v1:embedded_c', storedPlan=(await storedGrowth()).roadmapPlans[planId];
  assert.equal(storedPlan.projectUrl,'https://github.com/fixture/embedded-samples');
  assert.deepEqual(storedPlan.jobIds,[firmware]);
  assert.match(storedPlan.snapshot,/^[a-f0-9]{64}$/);
  await growthPage.reload();
  const adopted=growthPage.locator('[data-roadmap-task="'+planId+'"]');
  await adopted.locator('summary').first().click();
  assert.ok(await adopted.getByText('已选练习项目',{exact:true}).isVisible());
  assert.ok(await adopted.getByText('搭建一个最小工程并记录结果。',{exact:true}).isVisible());
  const targetTitle=await growthPage.evaluate(id=>CC.JOB_BY_ID.get(id).title,firmware);
  assert.equal(await adopted.getByText(/^当时的目标岗位/).textContent(),'当时的目标岗位 · '+targetTitle);
  const acceptance=adopted.getByRole('textbox',{name:/提交可复现日志和一个边界用例/});
  const noteFields=await adopted.locator('textarea[name="note"]').all();
  await adopted.getByRole('textbox',{name:'作品网址'}).fill('https://example.com/roadmap-result');
  for(const field of noteFields.slice(0,-1)) await field.fill('结果记录见作品附录。');
  await adopted.getByRole('button',{name:'保存复核材料'}).click();
  const submission=(await storedGrowth()).roadmapSubmissions[planId];
  assert.equal(submission.criteria.at(-1),storedPlan.verification);
  assert.equal(submission.plan.projectUrl,storedPlan.projectUrl);
  assert.equal(await adopted.getByRole('button',{name:'我已复核，计入档案'}).count(),0);
  assert.equal(await adopted.getByRole('button',{name:'取消采用项目'}).count(),0);
  await acceptance.fill('复现日志与边界用例见 test-results 附录。');
  await adopted.getByRole('button',{name:'保存复核材料'}).click();
  await adopted.getByRole('button',{name:'我已复核，计入档案'}).waitFor();
  growthPage.once('dialog',dialog=>dialog.accept());
  await adopted.getByRole('button',{name:'移除复核材料'}).click();
  await adopted.locator('summary').first().click();
  await adopted.getByRole('button',{name:'取消采用项目'}).click();
  assert.equal((await storedGrowth()).roadmapPlans[planId],undefined);
  await focus.selectOption('embedded_c');
  await growthPanel.getByRole('button',{name:'搜索并生成规划'}).click();
  const contestEntry=embeddedContest.locator('..');
  await contestEntry.getByRole('button',{name:'用作实战任务参考'}).click();
  const contestPlan=(await storedGrowth()).roadmapPlans[planId];
  assert.equal(contestPlan.kind,'contest');
  assert.equal(contestPlan.projectUrl,'https://www.socchina.net/wx/home?trackType=1');
  assert.equal((await storedGrowth()).roadmapSubmissions[planId],undefined);
  await growthPage.reload();
  await adopted.locator('summary').first().click();
  assert.ok(await adopted.getByText('已选赛事参考',{exact:true}).isVisible());
  const contestCheck=adopted.getByRole('textbox',{name:/作品记录参考赛项、本人负责的模块/});
  await contestCheck.fill('赛项、脚本和异常用例已记录在练习说明中。');
  await adopted.getByRole('button',{name:'保存复核材料'}).click();
  const contestDraft=(await storedGrowth()).roadmapSubmissions[planId];
  assert.equal(contestDraft.criteria.at(-1),contestPlan.verification);
  assert.equal(contestDraft.plan.kind,'contest');
  assert.equal(contestDraft.evidenceId,undefined);
  assert.equal(await adopted.getByRole('button',{name:'取消赛事参考'}).count(),0);
  const mirrorPlan=await growthPage.evaluate(async ({ids,snapshot})=>{
    const profile=CC.projectEmploymentMatchProfile(CC.ccProfileFromState({profile:{major:'计算机'},jobs:{}}));
    const response=await fetch('/employment/roadmaps/research',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({snapshot,jobIds:ids,profile})});
    return response.json();
  },{ids:mirrors,snapshot:pageOne.snapshot});
  assert.equal(mirrorPlan.assessments.length,1);
  assert.ok(mirrors.includes(mirrorPlan.assessments[0].jobId));
  assert.equal(mirrorPlan.demand.sampleSize,await growthPage.evaluate(()=>CC.distinctPostings(CC.allRequirements().filter(job=>
    CC.jobFamilyOf(job)?.id==='ai-applications')).filter(job=>!CC.jobFreshness(job).ended).length));
  await growthPage.close();

  await page.reload();
  assert.ok((await savedState()).jobs.targetReqIds.includes(jobId), 'Target should survive reload');
  assert.match(await target.textContent(), /已设为反推目标/);
  await page.locator('[data-action="cc-close-job"]').click();
  assert.equal(await page.locator('#cc-job-search').inputValue(), '项目');
  assert.equal(await cards.count(), cardCount);
  assert.equal((await savedState()).jobs.filters.exp, '实习');
  await page.locator('[data-action="cc-reset-filters"]').first().click();
  await page.locator('[data-action="cc-filter"][data-f="kind"][data-k="job"]').click();
  await page.locator('[data-action="cc-sort"][data-k="salary"]').click();
  const salaryOrder=await page.locator('.cc-job-card').evaluateAll(cards=>cards.map(card=>CC.salaryMonthlyOf(CC.REQ_BY_ID.get(card.dataset.jobId))??-1));
  assert.ok(salaryOrder.some(value=>value>0),'The local catalog must contain disclosed salaries');
  assert.ok(salaryOrder.every((value,index)=>index===0||value<=salaryOrder[index-1]));
  await cards.nth(0).locator('[data-action="cc-compare"]').click();
  const otherIndex=await cards.evaluateAll(items=>items.findIndex((item,index)=>index>0&&
    CC.REQ_BY_ID.get(item.dataset.jobId).org!==CC.REQ_BY_ID.get(items[0].dataset.jobId).org));
  assert.ok(otherIndex>0);
  await cards.nth(otherIndex).locator('[data-action="cc-compare"]').click();
  assert.equal(await page.locator('.cc-compare-item').count(),2);
  assert.equal(await page.locator('#cc-compare-panel').getByText('我的资格',{exact:true}).count(),2);
  await page.locator('[data-action="cc-run-compare-copilot"]').click();
  await page.locator('#cc-compare-copilot-panel').getByText('优先投递职责更聚焦',{exact:false}).waitFor();
  const offerPage=await browser.newPage({locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  try {
    offerPage.on('pageerror',error=>errors.push(error.message));
    await offerPage.route('**/*',route=>route.request().url().startsWith(origin+'/')
      ?route.continue():route.fulfill({status:200,body:''}));
    await offerPage.goto(origin+'/#jobs/list/job/'+encodeURIComponent(mealOffer.id));
    const terms=offerPage.getByRole('region',{name:'企业与待遇'});
    await terms.getByText('查看待遇与出勤原句',{exact:true}).click();
    assert.ok(await terms.locator('q').filter({hasText:/提供住宿\+食堂餐补300元\/月/}).isVisible());
    await offerPage.getByRole('button',{name:'加入对比',exact:true}).click();
    await offerPage.goto(origin+'/#jobs/list/job/'+encodeURIComponent(noConversionOffer.id));
    await offerPage.getByRole('button',{name:'加入对比',exact:true}).click();
    const comparison=offerPage.locator('#cc-compare-panel');
    assert.equal(await comparison.getByRole('article').count(),2);
    assert.ok(await comparison.locator('q').filter({hasText:/提供住宿\+食堂餐补300元\/月/}).isVisible());
    assert.ok(await comparison.locator('q').filter({hasText:/暂无法提供转正机会/}).isVisible());
    assert.ok(await comparison.getByText('暂无可引用原句',{exact:true}).first().isVisible());
  } finally { await offerPage.close(); }
  const companyDetails=page.locator('details.cc-more-filters');
  const companyFilter=companyDetails.locator('select[data-cc-filter="company"]');
  if(!await companyDetails.evaluate(node=>node.open)) await companyDetails.locator('summary').click();
  const companyChoice=await companyFilter.locator('option:not([value="all"])').first().getAttribute('value');
  await companyFilter.selectOption(companyChoice);
  assert.equal((await savedState()).jobs.filters.company,companyChoice);
  assert.ok(await page.locator('.cc-job-card').first().isVisible());
  await page.locator('[data-action="cc-reset-filters"]').first().click();
  assert.equal((await savedState()).jobs.filters.company,'all');
  await page.locator('.cc-employment-nav [data-mode="home"]').click();
  const familyId='backend',directionId='software';
  await page.getByRole('button',{name:'探索其他方向',exact:true}).click();
  await page.locator(`[data-action="cc-direction"][data-pref="primary"][data-id="${directionId}"]`).click();
  assert.equal((await savedState()).jobs.preferences.primaryDirectionId,directionId);
  assert.equal((await savedState()).jobs.viewMode,'direction');
  assert.equal(new URL(page.url()).hash,'#jobs/direction/software');
  assert.ok(await page.getByRole('heading',{name:'软件开发',exact:true}).isVisible());
  await cards.first().waitFor();
  const scopeOf=locator=>locator.evaluateAll(items=>items.map(item=>CC.jobFamilyOf(CC.REQ_BY_ID.get(item.dataset.jobId))));
  assert.ok((await scopeOf(cards)).every(item=>item.directionId===directionId));
  assert.ok(await page.evaluate(()=>window.scrollY<10));
  await page.locator(`[data-action="cc-family"][data-id="${familyId}"]`).click();
  assert.equal((await savedState()).jobs.viewMode,'family');
  assert.equal(new URL(page.url()).hash,'#jobs/family/backend');
  await page.getByRole('heading',{name:'服务端与全栈',exact:true}).waitFor();
  await cards.first().waitFor();
  assert.ok((await scopeOf(cards)).every(item=>item.id===familyId));
  await page.reload();
  assert.ok(await page.getByRole('heading',{name:'服务端与全栈',exact:true}).isVisible());
  await page.goBack();
  await page.getByRole('heading',{name:'软件开发',exact:true}).waitFor();
  assert.ok((await scopeOf(cards)).every(item=>item.directionId===directionId));
  await page.goForward();
  await page.getByRole('heading',{name:'服务端与全栈',exact:true}).waitFor();
  await cards.first().locator('[data-action="cc-open-job"]').first().click();
  const jobAddress=page.url();
  assert.match(new URL(jobAddress).hash,/^#jobs\/family\/backend\/job\//);
  const freshContext=await browser.newContext();
  try {
    const direct=await freshContext.newPage();
    await direct.route('**/*',route=>route.request().url().startsWith(origin+'/')
      ?route.continue():route.fulfill({status:200,body:''}));
    await direct.goto(jobAddress);
    await direct.locator('.cc-job-detail-title').waitFor();
    await direct.getByRole('button',{name:'← 返回岗位族',exact:true}).click();
    await direct.getByRole('heading',{name:'服务端与全栈',exact:true}).waitFor();
    assert.ok((await scopeOf(direct.locator('.cc-job-card'))).every(item=>item.id===familyId));
    await direct.goto(origin+'/#jobs/direction/hardware');
    await direct.getByRole('heading',{name:'硬件与电子电路',exact:true}).waitFor();
    await direct.getByRole('region',{name:'该方向的岗位族'}).getByRole('button',{name:/硬件开发 \/ 电路设计/}).click();
    await direct.waitForURL('**/#jobs/family/circuits');
    await direct.getByRole('heading',{name:'硬件开发 / 电路设计',exact:true}).waitFor();
    assert.ok((await scopeOf(direct.locator('.cc-job-card'))).every(item=>item.id==='circuits'));
    await direct.locator('.cc-job-card[data-job-id="jr_1jjue1m"]').getByRole('button',{name:/模拟IC设计工程师/}).click();
    await direct.waitForURL('**/#jobs/family/circuits/job/jr_1jjue1m');
    await direct.getByRole('button',{name:/查看硬件开发 \/ 电路设计岗位/}).click();
    await direct.waitForURL('**/#jobs/family/circuits');
    await direct.goto(origin+'/#jobs/family/ai-applications');
    const mirroredCards=direct.locator(mirrors.map(id=>`.cc-job-card[data-job-id="${id}"]`).join(','));
    await mirroredCards.first().waitFor();
    assert.equal(await mirroredCards.count(),1);
    const selectedSource=await mirroredCards.getAttribute('data-job-id');
    await mirroredCards.locator('.cc-job-title').click();
    await direct.getByText('同一岗位的其他来源',{exact:true}).click();
    assert.ok(await direct.locator(`details a[data-id="${mirrors.find(id=>id!==selectedSource)}"]`).isVisible());
    await direct.getByRole('button',{name:'隐藏此岗位',exact:true}).click();
    assert.equal(await mirroredCards.count(),0);
    await direct.getByRole('button',{name:'撤销',exact:true}).click();
    await mirroredCards.first().waitFor();
    assert.equal(await mirroredCards.count(),1);
  } finally { await freshContext.close(); }
  await page.getByRole('button',{name:'← 返回岗位族',exact:true}).click();
  await page.waitForURL('**/#jobs/family/backend');
  assert.ok((await scopeOf(cards)).every(item=>item.id===familyId));
  await page.getByRole('button',{name:'到岗位列表筛选',exact:false}).click();
  assert.equal((await savedState()).jobs.filters.direction,directionId);
  assert.equal((await savedState()).jobs.filters.family,familyId);
  await page.locator('.cc-employment-nav [data-mode="home"]').click();
  const featured=page.getByRole('region',{name:'首页推荐岗位'}).locator('.cc-job-card');
  await featured.first().waitFor();
  assert.ok((await scopeOf(featured)).every(item=>item.directionId===directionId));
  await page.locator('[data-action="cc-all-jobs"]').first().click();
  assert.equal((await savedState()).jobs.filters.direction,'all');
  assert.equal((await savedState()).jobs.filters.family,'all');
  await page.locator('.cc-employment-nav [data-mode="home"]').click();
  await page.locator('.cc-preferences > summary').click();
  await page.getByText('从简历添加经历',{exact:true}).click();
  await page.locator('#cc-resume-form textarea').fill('校园固件项目\n负责 STM32 调试\n邮箱：student@example.com');
  await page.locator('#cc-resume-form [type="submit"]').click();
  await page.locator('#cc-resume-confirm [type="submit"]').click();
  assert.ok((await savedState()).profile.achievements.some(entry=>entry.title==='校园固件项目'&&entry.verificationStatus==='unverified'));
  assert.ok(!JSON.stringify(await savedState()).includes('student@example.com'));
  assert.equal(await page.locator('#cc-import-form').count(), 0, 'External Boss/JD paste form must be removed');
  await page.locator('.cc-employment-nav [data-mode="list"]').click();
  await page.locator('[data-action="cc-live-panel"]').first().click();
  await page.locator('#cc-live-panel [data-action="cc-live-sync"]').click();
  await page.locator('.cc-job-card[data-job-id="live_tx_e2e_fw_001"] [data-action="cc-open-job"]').first().click();
  const importedId=(await savedState()).jobs.openJobId;
  assert.equal(importedId,'live_tx_e2e_fw_001');
  await page.locator('.cc-detail-tabs [data-action="cc-detail-tab"][data-key="jd"]').click();
  await page.getByText('按原文查看 JD 要点',{exact:true}).click();
  assert.ok(await page.getByText('开发固件',{exact:true}).isVisible());
  assert.ok(await page.getByText('协议与标准',{exact:true}).isVisible());
  await page.locator('.cc-detail-tabs [data-action="cc-detail-tab"][data-key="analysis"]').click();
  assert.ok(await page.locator('.cc-trace-graph svg').isVisible(), 'SVG evidence-to-JD traceability graph must render');
  await page.locator('[data-action="cc-open-resume-modal"]').click();
  await page.locator('#cc-resume-modal .cc-a4-sheet').waitFor();
  await page.locator('[data-action="cc-close-modal"]').click();
  assert.equal(await page.locator('#cc-resume-modal').count(), 0);
  assert.ok(await page.getByText('资格待核验',{exact:true}).isVisible());
  const advice=page.getByRole('region',{name:'投递建议'});
  assert.ok(await advice.getByText('先核对报名资格',{exact:true}).isVisible());
  await advice.getByText('这条岗位可使用的简历素材',{exact:true}).click();
  assert.ok(await advice.getByText('校园固件项目',{exact:true}).isVisible());
  assert.ok(await advice.getByText(/成果待确认/).first().isVisible());
  const practiceAdvice=advice.getByRole('button',{name:'打开这项实战任务',exact:false});
  const advisedTask=await practiceAdvice.getAttribute('data-id');
  assert.ok(await advice.locator('blockquote').filter({hasText:'熟悉 STM32 和 CAN 总线'}).first().isVisible());
  await practiceAdvice.click();
  assert.ok(await page.locator(`[data-roadmap-task="${advisedTask}"][open]`).isVisible());
  await page.locator('button[data-action="cc-target"]').click();
  const evidence=page.locator('#cc-evidence-form');
  const roadmap=page.getByRole('region',{name:'实战成长任务'});
  const canTask=roadmap.locator('[data-roadmap-task="roadmap-v1:industrial_bus"]');
  await canTask.locator('summary').click();
  await canTask.getByRole('textbox',{name:'验收 1',exact:false}).fill('复现记录 A');
  await canTask.getByRole('button',{name:'保存复核材料'}).click();
  assert.ok(await canTask.getByText('待补充材料',{exact:true}).isVisible());
  assert.equal(await canTask.getByRole('button',{name:'我已复核，计入档案'}).count(),0);
  await canTask.getByText('请本地千问复核材料',{exact:true}).click();
  const modelExcerpt=canTask.getByRole('textbox',{name:'作品或测试记录片段'});
  await modelExcerpt.fill('姓名：PRIVATE_NAME\n指定 ID 321 收发一致\nhttps://example.com/private');
  await canTask.getByRole('button',{name:'分析所选片段'}).click();
  await canTask.getByText('验收 1 · 片段提供支持',{exact:false}).waitFor();
  assert.ok(await canTask.getByText('验收 2 · 材料不足',{exact:true}).isVisible());
  assert.doesNotMatch(JSON.stringify(await savedState()),/PRIVATE_NAME|321 收发一致/);
  offlineReview=true;
  await modelExcerpt.fill('指定 ID 321 收发一致');
  await canTask.getByRole('button',{name:'分析所选片段'}).click();
  await canTask.getByText('本地模型暂不可用或未返回可引用的材料。可以继续本人复核。',{exact:true}).waitFor();
  assert.equal(await canTask.getByText('验收 1 · 片段提供支持',{exact:false}).count(),0);
  offlineReview=false;
  await canTask.getByRole('textbox',{name:'作品网址'}).fill('https://example.com/can-demo');
  await canTask.getByRole('textbox',{name:'验收 2',exact:false}).fill('过滤用例结果 B');
  await canTask.getByRole('button',{name:'保存复核材料'}).click();
  assert.ok(!(await savedState()).profile.evidences?.some(item=>item.roadmap));
  const canStatus=()=>page.evaluate(()=>CC.reverseStatusOf(CC.ccProfileFromState(JSON.parse(localStorage.getItem('course-compass-v1'))),'industrial_bus'));
  assert.notEqual(await canStatus(),'VERIFIED');
  await canTask.getByRole('button',{name:'我已复核，计入档案'}).click();
  const confirmed=(await savedState()).profile.evidences.find(item=>item.roadmap?.skillId==='industrial_bus');
  assert.equal(confirmed.verificationStatus,'user_confirmed');
  assert.equal(await canStatus(),'VERIFIED');
  assert.match(await canTask.locator('summary').textContent(),/已计入档案/);
  await page.reload();
  assert.ok(await canTask.getByText('已计入档案',{exact:true}).isVisible());
  assert.equal(await canTask.getByRole('link',{name:'查看本人确认的作品',exact:false}).getAttribute('href'),'https://example.com/can-demo');
  await canTask.getByRole('button',{name:'撤回本人确认'}).click();
  assert.ok(!(await savedState()).profile.evidences.some(item=>item.id===confirmed.id));
  assert.notEqual(await canStatus(),'VERIFIED');
  page.once('dialog',dialog=>dialog.accept());
  await canTask.getByRole('button',{name:'移除复核材料'}).click();
  assert.equal((await savedState()).jobs.roadmapSubmissions['roadmap-v1:industrial_bus'],undefined);
  await page.getByText('记录已完成的成果',{exact:true}).click();
  await evidence.locator('input[name="title"]').fill('STM32 实验');
  await evidence.locator('textarea[name="desc"]').fill('完成 STM32 与 CAN 总线收发测试');
  await evidence.locator('input[name="verified"]').check();
  await evidence.locator('[type="submit"]').click();
  assert.equal((await savedState()).profile.evidences.at(-1).verificationStatus,'user_confirmed');
  await page.locator('[data-cc-application]').selectOption('applied');
  assert.equal((await savedState()).jobs.applications[importedId].status,'applied');
  await page.locator('.cc-detail-tabs [data-action="cc-detail-tab"][data-key="analysis"]').click();
  assert.ok(await advice.getByText('本机已记录 · 已投递',{exact:true}).isVisible());
  await advice.getByText('这条岗位可使用的简历素材',{exact:true}).click();
  assert.ok(await advice.getByText('STM32 实验',{exact:true}).isVisible());
  assert.ok(await advice.getByText(/成果已有确认/).first().isVisible());
  const practiceTab=page.locator('[data-action="cc-detail-tab"][data-key="practice"]');
  await practiceTab.click();
  const practice=page.getByRole('region',{name:'项目与面试准备'});
  assert.equal(await practice.locator('a[href^="https://github.com/"]').count(),0,'Hardware exercise requires the device in run mode');
  await practice.getByText('有匹配的开发板').check();
  await practice.getByLabel('准备深度').selectOption('full');
  await practice.getByLabel('可投入时间').selectOption('16');
  await practice.getByLabel('练习偏好').selectOption('firmware');
  assert.ok(await practice.getByText('符合项目偏好',{exact:false}).isVisible());
  await practice.getByText('JD 依据与档案状态').click();
  assert.match(await practice.locator('blockquote').first().textContent(),/已有证据.*STM32/s);
  await practice.getByLabel('已保存改造验证').check();
  await page.reload();
  assert.equal(await practice.getByLabel('可投入时间').inputValue(),'16');
  assert.equal(await practice.getByLabel('练习偏好').inputValue(),'firmware');
  assert.ok(await practice.getByLabel('已保存改造验证').isChecked());
  const studyFolder=mkdtempSync(join(tmpdir(),'cc-practice-'));
  const studySrc=join(studyFolder,'src'),studyEntry=join(studySrc,'main.c');
  const studyReadme=join(studyFolder,'README.md'),studyIgnored=join(studyFolder,'.env');
  mkdirSync(studySrc);
  for(const file of [studyEntry,studyReadme,studyIgnored]) writeFileSync(file,'test content');
  try {
    await practice.getByLabel('选择本地目录').setInputFiles(studyFolder);
    assert.ok(await practice.getByText('src/main.c',{exact:true}).isVisible());
    assert.equal(await practice.getByText('.env',{exact:true}).count(),0);
    assert.ok(!JSON.stringify(await savedState()).includes('src/main.c'));
  } finally {
    for(const file of [studyEntry,studyReadme,studyIgnored]) unlinkSync(file);
    rmdirSync(studySrc);
    rmdirSync(studyFolder);
  }
  const [interview]=await Promise.all([page.waitForEvent('download'),practice.getByRole('button',{name:'下载面试准备包'}).click()]);
  const interviewText=readFileSync(await interview.path(),'utf8');
  for(const expected of ['github.com/STMicroelectronics/STM32CubeF4','STM32 实验','## STAR 草稿','## 面试追问','- [x] 已保存改造验证','src/main.c']) assert.ok(interviewText.includes(expected),expected);
  await practice.getByRole('button',{name:'清除目录检查'}).click();
  assert.equal(await practice.getByText('src/main.c',{exact:true}).count(),0);
  await page.setViewportSize({width:390,height:800});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Practice layout should fit the mobile viewport');
  await page.setViewportSize({width:1280,height:720});
  await page.locator('[data-action="cc-close-job"]').click();
  await page.locator('.cc-employment-nav [data-mode="calendar"]').click();
  await page.locator('.cc-cal-card').first().waitFor();
  await page.locator('.cc-employment-nav [data-mode="saved"]').click();
  await page.locator('#cc-postmortem-form input[name="company"]').fill('腾讯后端一面');
  await page.locator('#cc-postmortem-form input[name="question"]').fill('被追问 Redis 缓存击穿与 Kafka 消息幂等');
  await page.locator('#cc-postmortem-form [type="submit"]').click();
  await page.locator('[data-action="cc-postmortem-practice"][data-skill="redis"]').waitFor();
  await page.locator('.cc-employment-nav [data-mode="roadmap"]').click();
  await page.locator('.cc-bili-btn').first().waitFor();
  await page.locator('[data-cc-coldstart="suppressed"]').waitFor();
  await page.locator('.cc-employment-nav [data-mode="home"]').click();
  await page.locator('[data-cc-switch-persona]').selectOption('p_mat');
  await page.locator('.cc-employment-nav [data-mode="roadmap"]').click();
  await page.locator('[data-cc-coldstart="active"]').waitFor();
  await page.locator('.cc-employment-nav [data-mode="home"]').click();
  await page.locator('.cc-preferences > summary').click();
  await page.locator('#cc-preferences-form input[name="personalized"]').uncheck();
  await page.locator('#cc-preferences-form [type="submit"]').click();
  assert.equal((await savedState()).jobs.personalized,false);
  assert.equal(await page.locator('.cc-job-card .cc-job-match').count(),0);
  await page.locator('.cc-employment-nav [data-mode="saved"]').click();
  const markedRow=page.locator(`.cc-marked-card[data-job-id="${importedId}"]`);
  await markedRow.locator('[data-action="cc-set-application"][data-status="interview"]').click();
  assert.equal((await savedState()).jobs.applications[importedId].status,'interview');
  assert.ok(await page.locator('.cc-funnel-stat').filter({hasText:'笔面试'}).getByText('1',{exact:true}).isVisible(),'Kanban funnel should follow the marked status');
  await markedRow.locator('[data-action="cc-open-job"]').first().click();
  assert.equal(await practiceTab.count(),0);
  await page.setViewportSize({width:390,height:800});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile layout should fit the viewport');

  const reviewPage=await browser.newPage({locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  reviewPage.on('pageerror',error=>errors.push(error.message));
  await reviewPage.route('**/*',route=>route.request().url().startsWith(origin+'/')
    ?route.continue():route.fulfill({status:200,body:''}));
  await reviewPage.goto(origin);
  await reviewPage.locator('.nav-item[data-module="profile"]').click();
  await reviewPage.locator('[data-field="school"]').fill('E2E_PRIVATE_SCHOOL');
  await reviewPage.locator('[data-action="profile-next"]').click();
  await reviewPage.locator('#step3-major').fill('机械电子工程');
  await reviewPage.locator('[data-action="profile-next"]').click();
  await reviewPage.locator('.nav-item[data-module="profile"]').click();
  const reviewPreview=reviewPage.locator('[data-action="goto-preview"]').first();
  if(await reviewPreview.count()) await reviewPreview.click();
  else await reviewPage.locator('[data-action="gate-defer-all"]').first().click();
  await reviewPage.locator('[data-action="profile-save"]').click();
  await reviewPage.locator('.nav-item[data-module="jobs"]').click();
  await reviewPage.locator('.cc-employment-nav [data-mode="list"]').click();
  await reviewPage.getByText('招聘来源与快照检查',{exact:true}).click();
  await reviewPage.locator('.cc-source-health').first().waitFor();
  const direct=await reviewPage.evaluate(()=>{
    const job=CC.DATA.jobs.find(entry=>entry.sourceSnapshot?.via==='smartrecruiters'&&entry.sourceSnapshot.applyUrl);
    return job&&{id:job.id,org:job.org,url:job.sourceSnapshot.applyUrl,status:CC.jobFreshness(job).status};
  });
  assert.ok(direct,'The catalog must include an official posting with a verified application URL');
  const reviewCompanyDetails=reviewPage.locator('details.cc-more-filters');
  if(!await reviewCompanyDetails.evaluate(node=>node.open)) await reviewCompanyDetails.locator('summary').click();
  await reviewPage.locator('select[data-cc-filter="company"]').selectOption(direct.org);
  await reviewPage.locator('.cc-job-card[data-job-id="'+direct.id+'"] .cc-job-actions [data-action="cc-open-job"]').click();
  const applyLink=reviewPage.locator('[data-action="cc-apply-started"]');
  if(['confirmed_active','observed_active'].includes(direct.status)) assert.equal(await applyLink.getAttribute('href'),direct.url);
  else assert.equal(await applyLink.count(),0);
  await reviewPage.locator('[data-action="cc-run-copilot"]').waitFor();
  assert.equal(await reviewPage.getByLabel('八维字段匹配矩阵').locator('.cc-field-row').count(),8);
  await reviewPage.locator('[data-action="cc-run-copilot"]').click();
  await reviewPage.locator('#cc-copilot-panel').getByText('八维字段硬门槛核对清晰',{exact:false}).waitFor();
  assert.match(await reviewPage.locator('#cc-copilot-panel').textContent(),/qwen3\.8-27b-local/);
  await reviewPage.locator('.cc-detail-tabs [data-action="cc-detail-tab"][data-key="jd"]').click();
  await reviewPage.locator('[data-action="cc-run-jd-parse"]').click();
  await reviewPage.locator('#cc-jd-copilot-panel').getByText('面向工程研发与测试联调的核心技术岗',{exact:false}).waitFor();
  await reviewPage.locator('.cc-detail-tabs [data-action="cc-detail-tab"][data-key="analysis"]').click();
  await reviewPage.getByText('试用反馈',{exact:true}).click();
  await reviewPage.getByRole('button',{name:'有帮助',exact:true}).click();
  await reviewPage.getByRole('button',{name:'符合方向',exact:true}).click();
  await reviewPage.locator('[data-action="cc-close-job"]').click();
  await reviewPage.locator('.cc-preferences > summary').click();
  await reviewPage.getByText('试用评测',{exact:true}).click();
  await reviewPage.getByRole('button',{name:'打开试用问卷',exact:false}).click();
  const questionnaire=reviewPage.locator('#cc-pilot-form');
  await questionnaire.locator('input[name="scoreMeaning"][value="profile_alignment"]').check();
  await questionnaire.locator('input[name="directionUseful"][value="yes"]').check();
  await questionnaire.getByRole('radio',{name:'值得核对',exact:true}).first().check();
  await questionnaire.getByRole('button',{name:'保存试用答案'}).click();
  await reviewPage.reload();
  assert.ok(await questionnaire.locator('input[name="scoreMeaning"][value="profile_alignment"]').isChecked());
  const downloadReady=reviewPage.waitForEvent('download');
  await reviewPage.getByRole('button',{name:'下载评测样本',exact:true}).click();
  const download=await downloadReady;
  const reviewText=readFileSync(await download.path(),'utf8');
  const review=JSON.parse(reviewText);
  assert.ok(!reviewText.includes('E2E_PRIVATE_SCHOOL'));
  assert.equal(review.cases[0].candidates.length,40);
  assert.match(review.cases[0].caseId,/^[a-f0-9]{32}$/);
  assert.equal(review.cases[0].studentFeedback[direct.id].explanationUseful,true);
  assert.equal(review.cases[0].studentFeedback[direct.id].roleRelevant,true);
  assert.equal(review.cases[0].pilot.answers.scoreMeaning,'profile_alignment');
  assert.equal(review.cases[0].pilot.topJobIds.length,5);
  assert.equal(Object.values(review.cases[0].pilot.topJobTrust).join(','),'yes');
  assert.equal(review.cases[0].pilot.answers.roadmapActionable,undefined);
  assert.ok(Object.values(review.cases[0].labels).every(label=>label.grade===null));
  const secondDownloadReady=reviewPage.waitForEvent('download');
  await reviewPage.getByRole('button',{name:'下载评测样本',exact:true}).click();
  const secondDownload=await secondDownloadReady;
  const repeated=JSON.parse(readFileSync(await secondDownload.path(),'utf8'));
  assert.equal(repeated.cases[0].caseId,review.cases[0].caseId);
  const pilotReport=JSON.parse(execFileSync(process.execPath,[
    fileURLToPath(new URL('./_employment-eval.mjs',import.meta.url)),'--pilot',await download.path(),await secondDownload.path(),
  ],{encoding:'utf8'}));
  assert.equal(pilotReport.participantsWithAnswers,1);
  assert.equal(pilotReport.scoreMeaning.positiveRate,1);
  assert.equal(pilotReport.roadmapActionable.responses,0);
  assert.equal(pilotReport.topFiveTrust.responses,1);
  await reviewPage.locator('.nav-item[data-module="evidence"]').click();
  const engineBox=reviewPage.locator('details.engine-box');
  if(!await engineBox.evaluate(node=>node.open)) await engineBox.locator('summary').click();
  await reviewPage.locator('#ev-engine').selectOption('qwen');
  await reviewPage.locator('#ev-text').fill('姓名：PRIVATE_NAME 电话：13800138000 邮箱：secret@example.com 课程设计独立完成机电闭环控制实验与串口日志采集。');
  await reviewPage.locator('[data-action="ev-analyze"]').click();
  await reviewPage.locator('#ev-out').getByText('课程实验转化为可复现的工程验证项目',{exact:false}).waitFor();
  assert.ok(llmCalls.length>=4);
  const reviewDirectory=mkdtempSync(join(tmpdir(),'cc-expert-review-'));
  const reviewerHtml=join(reviewDirectory,'reviewer.html');
  const gradedFile=join(reviewDirectory,'graded.ndjson');
  const calibrationFile=join(reviewDirectory,'calibration-fixture.ndjson');
  const annotate=fileURLToPath(new URL('./_employment-annotate.mjs',import.meta.url));
  const reviewCatalog=fileURLToPath(new URL('./_cc-data.json',import.meta.url));
  const sample=await download.path();
  const annotateRun=(mode,out,...args)=>execFileSync(process.execPath,[annotate,mode,reviewCatalog,out,sample,...args],{encoding:'utf8'});
  try {
    annotateRun('prepare',reviewerHtml);
    const reviewer=await browser.newPage();
    try {
      reviewer.on('pageerror',error=>errors.push(error.message));
      await reviewer.goto(pathToFileURL(reviewerHtml).href);
      assert.ok(await reviewer.getByRole('heading',{name:'去标识画像'}).isVisible());
      const jobs=reviewer.getByRole('article');
      assert.equal(await jobs.count(),40);
      assert.equal(await reviewer.getByText('E2E_PRIVATE_SCHOOL',{exact:false}).count(),0);
      assert.equal(await jobs.first().getByText('核对重算的推荐理由',{exact:true}).isVisible(),false);
      await jobs.first().getByLabel('岗位相关性',{exact:false}).selectOption('3');
      await jobs.nth(1).getByLabel('岗位相关性',{exact:false}).selectOption('0');
      await jobs.first().getByText('核对重算的推荐理由',{exact:true}).click();
      await jobs.first().getByLabel('理由与证据一致',{exact:false}).selectOption('yes');
      const annotation=reviewer.waitForEvent('download');
      await reviewer.getByRole('button',{name:'下载专家标注'}).click();
      const labelsPath=await (await annotation).path();
      const ids=review.cases[0].candidates.map(candidate=>candidate.jobId);
      await reviewer.reload();
      const resume=reviewer.getByLabel('导入已下载的标注');
      await resume.setInputFiles(labelsPath);
      await reviewer.getByText('已导入 2 条标注。',{exact:true}).waitFor();
      assert.equal(await jobs.first().getByLabel('岗位相关性',{exact:false}).inputValue(),'3');
      assert.equal(await jobs.nth(1).getByLabel('岗位相关性',{exact:false}).inputValue(),'0');
      assert.equal(await jobs.nth(2).getByLabel('岗位相关性',{exact:false}).inputValue(),'');
      const conflicting=JSON.parse(readFileSync(labelsPath,'utf8'));
      conflicting.cases[0].labels={[ids[2]]:{grade:2},[ids[0]]:{grade:1}};
      await resume.setInputFiles({name:'conflict.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(conflicting))});
      await reviewer.getByText('文件中的评分与当前页面冲突，请核对后再导入。',{exact:true}).waitFor();
      assert.equal(await jobs.nth(2).getByLabel('岗位相关性',{exact:false}).inputValue(),'');
      annotateRun('attach',gradedFile,'--labels',labelsPath);
      const document=JSON.parse(readFileSync(gradedFile,'utf8'));
      assert.deepEqual(document.cases[0].labels[ids[0]],{grade:3,explanationMatches:true});
      assert.deepEqual(document.cases[0].labels[ids[1]],{grade:0,explanationMatches:null});
      assert.equal(document.cases[0].labels[ids[2]].grade,null);
      const runEvaluation=(...args)=>JSON.parse(execFileSync(process.execPath,[
        fileURLToPath(new URL('./_employment-eval.mjs',import.meta.url)),...args,
      ],{encoding:'utf8'}));
      const evaluation=runEvaluation(gradedFile);
      assert.equal(evaluation.judgedPostings,2);
      assert.equal(evaluation.explanationAgreement,1);
      assert.equal(evaluation.judgmentScope,'expert-graded-postings-only');
      const cohort=runEvaluation('--cohort',gradedFile);
      assert.equal(cohort.coverage.participantsWithGrades,1);
      assert.equal(cohort.sizeTarget.observed,0);
      assert.deepEqual(cohort.proposedSplit.validationCaseIds,[]);
      const source=document.cases[0];
      const fixtureCases=['1','2'].map(digit=>({...source,caseId:digit.repeat(32),
        labels:Object.fromEntries(ids.map((id,index)=>[id,{grade:index%4}]))}));
      writeFileSync(calibrationFile,JSON.stringify({...document,cases:[...fixtureCases,source]})+'\n');
      const partition=runEvaluation('--cohort',calibrationFile).proposedSplit;
      const calibration=runEvaluation('--calibrate',calibrationFile);
      assert.deepEqual(calibration.partition,partition);
      assert.equal(calibration.coverage.participantsWithGrades,3);
      assert.equal(calibration.assessment.completeCases,2);
      assert.equal(calibration.assessment.status,'retain_baseline');
      assert.deepEqual(calibration.assessment.recommendedWeights,calibration.baselineWeights);
    } finally { await reviewer.close(); }
  } finally {
    for(const file of [reviewerHtml,gradedFile,calibrationFile]){
      try { unlinkSync(file); } catch(error) { if(error.code!=='ENOENT') throw error; }
    }
    rmdirSync(reviewDirectory);
  }

  // Verify merged local encrypted student profiles, course review, achievement evidence link, and version history
  const vaultContext = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  try {
    const vaultPage = await vaultContext.newPage();
    vaultPage.on('pageerror', error => errors.push(error.message));
    await vaultPage.route('**/*', route => route.request().url().startsWith(origin + '/')
      ? route.continue()
      : route.fulfill({ status: 200, body: '' }));
    await vaultPage.goto(origin);
    await vaultPage.locator('[data-action="account-open"]').first().click();
    await vaultPage.locator('#cc-name').fill('e2e_alice');
    await vaultPage.locator('#cc-pass').fill('local-vault-pass');
    await vaultPage.locator('#account-form button[value="register"]').click();
    await vaultPage.locator('#account-label').filter({ hasText: 'e2e_alice' }).waitFor();

    await vaultPage.locator('.nav-item[data-module="profile"]').click();
    await vaultPage.locator('#basic-school').fill('VAULT_PRIVATE_UNIV');
    await vaultPage.locator('#basic-major').fill('计算机科学与技术');
    await vaultPage.locator('#basic-grade').selectOption('大三');
    await vaultPage.locator('#basic-rank').fill('50');
    await vaultPage.locator('#basic-rankTotal').fill('30');
    assert.match(await vaultPage.locator('#error-rank').textContent(), /不能超过专业总人数/);
    await vaultPage.locator('#basic-rank').fill('8');
    assert.equal(await vaultPage.locator('#error-rank').textContent(), '');
    await vaultPage.locator('[data-action="profile-next"]').click();

    await vaultPage.locator('[data-action="course-mode"][data-mode="manual"]').click();
    await vaultPage.locator('#course-input').fill('数据库原理');
    await vaultPage.locator('[data-action="course-add"]').click();
    await vaultPage.locator('#batch-version').fill('2024级培养方案');
    await vaultPage.locator('[data-action="course-review-save"]').click();
    assert.ok(await vaultPage.getByText('2024级培养方案', { exact: false }).isVisible());
    await vaultPage.locator('[data-action="profile-next"]').click();

    // Step 04: Experience Workshop — verify AI/rule suggestions do NOT enter profile until user confirms in Step 4 edit area
    await vaultPage.locator('#ev-text').fill('独立开发高并发选课网关项目，使用 Java Spring Boot 与 Redis Lua 实现分布式限流。');
    await vaultPage.locator('[data-action="ev-analyze"]').click();
    await vaultPage.locator('#ws-title').waitFor();
    assert.equal(await vaultPage.evaluate(() => state.profile.achievements.length), 0, 'Suggestions must not auto-write to profile before confirmation');
    await vaultPage.locator('#ws-title').fill('高并发选课网关');
    await vaultPage.locator('#ev-role').fill('负责 Spring Boot 与 Redis Lua 限流器');
    await vaultPage.locator('#ev-materials').fill('https://example.com/course-gateway');
    await vaultPage.locator('#ws-truth').check();
    await vaultPage.locator('[data-action="ev-save"]').click();
    assert.equal(await vaultPage.evaluate(() => state.profile.achievements.length), 1);
    await vaultPage.getByRole('button',{name:'去「时间与成果」→',exact:true}).click();

    // Step 05: Parallel schedules (05a) + available time (05b) + synced achievements (05c) + Completeness Gate -> Step 06 Preview
    await vaultPage.locator('#sch-title').fill('秋季期末集中考试周');
    await vaultPage.locator('#sch-start').fill('2027-01-11');
    await vaultPage.locator('#sch-end').fill('2027-01-22');
    await vaultPage.locator('#sch-slots').fill('全天复习与考试');
    await vaultPage.locator('[data-action="sch-add"]').click();
    assert.ok(await vaultPage.locator('.list-row').getByText('秋季期末集中考试周', { exact: false }).first().isVisible());
    assert.ok(await vaultPage.locator('.list-row').getByText('高并发选课网关', { exact: false }).first().isVisible());
    await vaultPage.locator('[data-action="gate-defer-all"], [data-action="goto-preview"]').first().click();

    // Step 06: Structured Capability Profile default view -> toggle Resume view -> Confirm & Archive
    assert.ok(await vaultPage.getByText('客观提取技能图谱', { exact: false }).first().isVisible());
    await vaultPage.locator('[data-action="preview-mode"][data-mode="resume"]').click();
    assert.ok(await vaultPage.getByRole('article', { name: '基础简历预览视图' }).isVisible());
    await vaultPage.locator('[data-action="preview-mode"][data-mode="capability"]').click();
    await vaultPage.locator('[data-action="profile-save"]').click();

    // Open user path exploration -> Consistent direction index in Diagnosis & Employment -> Job Save Write-Back -> Conflict Chart
    assert.deepEqual(await vaultPage.evaluate(() => state.paths), [], 'Paths must remain empty until user freely chooses');
    await vaultPage.locator('[data-action="path-toggle"][data-path="kaoyan"]').click();
    await vaultPage.locator('[data-action="path-toggle"][data-path="jiuye"]').click();
    await vaultPage.locator('[data-action="go-diag"]').click();
    await vaultPage.locator('[data-action="diag-tab"][data-path="jiuye"]').click();
    const diagDirName = (await vaultPage.locator('#diag-jiuye-summary .f-chips span').first().textContent()).trim().replace(/^方向 · /, '');
    await vaultPage.locator('[data-action="diag-add-path"][data-path="baoyan"]').click();
    assert.ok(await vaultPage.locator('[data-action="diag-tab"][data-path="baoyan"]').isVisible());
    await vaultPage.locator('.nav-item[data-module="jobs"]').click();
    assert.equal(await vaultPage.locator('.cc-quick-tools').count(), 0, 'Duplicate quick tools bar must be removed');
    assert.equal(await vaultPage.getByText('求职就绪度概览', { exact: false }).count(), 0, 'Fake KPI strip must be removed');
    assert.equal(await vaultPage.getByLabel('31.8万校招仓定向直通车').count(), 0, 'Duplicate warehouse strip must be removed from home');
    const jobsDirName = (await vaultPage.locator('.cc-direction-card h3').first().textContent()).trim();
    assert.equal(diagDirName, jobsDirName, 'Diagnosis direction must match Employment direction card');
    await vaultPage.locator('.cc-employment-nav [data-mode="list"]').click();
    await vaultPage.locator('.cc-job-card [data-action="cc-save-job"]').first().click();
    await vaultPage.locator('.nav-item[data-module="paths"]').click();
    assert.ok(await vaultPage.locator('#global-action-plan').getByText('投递跟进', { exact: false }).first().isVisible());
    await vaultPage.locator('.nav-item[data-module="conflict"]').click();
    assert.ok(await vaultPage.getByText('秋季期末集中考试周', { exact: false }).first().isVisible());
    assert.ok(await vaultPage.getByText('待补信息与不确定性声明', { exact: false }).first().isVisible());

    const encryptedCheck = await vaultPage.evaluate(() => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('cc.profile.'));
      const raw = keys.length ? localStorage.getItem(keys[0]) : '';
      const plain = localStorage.getItem('course-compass-v1') || '';
      return { keyCount: keys.length, raw, plain };
    });
    assert.equal(encryptedCheck.keyCount, 1);
    assert.ok(!encryptedCheck.raw.includes('VAULT_PRIVATE_UNIV'));
    assert.ok(!encryptedCheck.plain.includes('VAULT_PRIVATE_UNIV'));

    await vaultPage.locator('.nav-item[data-module="profile"]').click();
    await vaultPage.locator('[data-action="profile-history"]').click();
    assert.ok(await vaultPage.locator('#confirmed-view').getByText('VAULT_PRIVATE_UNIV', { exact: false }).first().isVisible());
    await vaultPage.locator('#profile-history button[type="submit"]').click();

    const profileDlPromise = vaultPage.waitForEvent('download');
    await vaultPage.locator('[data-action="profile-export"]').click();
    const exportedJson = JSON.parse(readFileSync(await (await profileDlPromise).path(), 'utf8'));
    assert.equal(exportedJson.schemaVersion, 2);
    assert.equal(exportedJson.account, 'e2e_alice');
    assert.equal(exportedJson.confirmationHistory.length, 1);

    vaultPage.once('dialog', dialog => dialog.accept());
    await vaultPage.locator('[data-action="profile-delete"]').click();
    await vaultPage.locator('#account-label').filter({ hasText: 'e2e_alice' }).waitFor();
    await vaultPage.getByText('查看历史档案（0）', { exact: false }).waitFor();

    // Verify zero-project student enters courses/coursework ONCE in Profile and Employment inherits cleanly without duplicate forms
    await vaultPage.locator('[data-action="profile-goto"][data-page="0"]').first().click();
    await vaultPage.locator('#basic-school').fill('临江学院');
    await vaultPage.locator('#basic-major').fill('计算机科学与技术');
    await vaultPage.locator('#basic-grade').selectOption('大三');
    await vaultPage.locator('[data-action="profile-next"]').click();
    await vaultPage.locator('[data-action="course-mode"][data-mode="manual"]').click();
    await vaultPage.locator('#course-input').fill('数据库原理课程设计');
    await vaultPage.locator('[data-action="course-add"]').click();
    await vaultPage.locator('[data-action="course-review-save"]').click();
    await vaultPage.locator('[data-action="profile-goto"][data-page="3"]').first().click();
    await vaultPage.locator('[data-action="gate-defer-all"], [data-action="goto-preview"]').first().click();
    await vaultPage.locator('[data-action="profile-save"]').click();
    await vaultPage.locator('.nav-item[data-module="jobs"]').click();
    assert.ok(await vaultPage.locator('.cc-profile-bar').getByText('已继承课设/实验 1 项', { exact: false }).first().isVisible());
    assert.ok(await vaultPage.getByRole('heading', { name: '方向与岗位族', exact: true }).isVisible());
    assert.ok(await vaultPage.getByRole('heading', { name: '软件开发', exact: true }).first().isVisible());

    // Verify Experience Intel M0-M4 full UX loop: Home 4-slot digest -> Diagnosis peer cards -> Adopt to Conflict workload -> Import interview questions -> Zero-knowledge feedback
    await vaultPage.locator('.nav-item[data-module="dash"]').click();
    const digestCards = vaultPage.locator('#weekly-exp-digest .exp-digest-card');
    const digestCount = await digestCards.count();
    assert.ok(digestCount >= 3 && digestCount <= 4, `Expected 3-4 anti-anxiety weekly digest cards, got ${digestCount}`);

    await vaultPage.locator('[data-action="path-toggle"][data-path="jiuye"]').count();
    await vaultPage.locator('.nav-item[data-module="paths"]').click();
    await vaultPage.locator('[data-action="path-toggle"][data-path="jiuye"]').click();
    await vaultPage.locator('[data-action="go-diag"]').click();
    assert.ok(await vaultPage.locator('#diag-peer-experiences .exp-digest-card').first().isVisible(), 'Diagnosis view must embed peer-baseline experience cards');

    // Adopt experience action task and verify Conflict Chart load immediately increases
    await vaultPage.locator('#diag-peer-experiences [data-action="intel-adopt-task"]').first().click();
    assert.ok(await vaultPage.locator('#global-action-plan').getByText('实战经验采纳', { exact: false }).first().isVisible());
    await vaultPage.locator('.nav-item[data-module="conflict"]').click();
    assert.ok(await vaultPage.getByText('已采纳实战经验行动', { exact: false }).first().isVisible());
    assert.ok(await vaultPage.getByText('实战经验行动', { exact: false }).first().isVisible());

    // Navigate to promoted core sidebar item "实战情报", import interview questions, and verify negative feedback reranking
    const navTexts = await vaultPage.locator('#nav .nav-item').allTextContents();
    const jobsNavIdx = navTexts.findIndex(t => t.includes('就业·岗位库'));
    const intelNavIdx = navTexts.findIndex(t => t.includes('实战情报'));
    const conflictNavIdx = navTexts.findIndex(t => t.includes('冲突海图'));
    assert.ok(intelNavIdx > jobsNavIdx && intelNavIdx < conflictNavIdx, '实战情报 must sit in the core exploration group between 就业·岗位库 and 冲突海图');

    await vaultPage.locator('.nav-item[data-module="intel"]').click();
    await vaultPage.locator('[data-action="intel-cat"][data-cat="interview_exp"]').click();
    assert.ok(await vaultPage.locator('.intel-card').first().isVisible());
    await vaultPage.locator('.intel-card [data-action="intel-import-questions"]').first().click();
    await vaultPage.locator('.intel-card [data-action="intel-not-peer"]').first().click();
    const hasNegWeight = await vaultPage.evaluate(() => Object.values(state.intelPrefs?.tagWeights || {}).some(v => v < 0));
    assert.equal(hasNegWeight, true, 'Local zero-knowledge tagWeights must record negative peer preference');

    // Verify imported interview questions appear on Employment Kanban postmortem board
    await vaultPage.locator('.nav-item[data-module="jobs"]').click();
    await vaultPage.locator('.cc-employment-nav [data-mode="saved"]').click();
    assert.ok(await vaultPage.getByText('实战面经', { exact: false }).first().isVisible());
  } finally {
    await vaultContext.close();
  }

  assert.deepEqual(errors, []);
  console.log('Employment browser checks passed');
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  unlinkSync(catalogFile);
  rmdirSync(catalogDirectory);
}
