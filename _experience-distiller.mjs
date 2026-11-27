import { createHash } from 'node:crypto';
import { getExperienceChannel } from './_experience-channels.mjs';
import { redactExperiencePii } from './_experience-cleaner.mjs';

const KNOWN_ORGS = [
  '腾讯', '阿里巴巴', '淘天', '阿里云', '蚂蚁', '字节跳动', '美团', '京东', '百度', '网易',
  '滴滴', '快手', '拼多多', '小红书', '哔哩哔哩', 'B站', '米哈游', '华为', '小米', '大疆',
  '比亚迪', '蔚来', '理想汽车', '小鹏汽车', '博世', '大陆集团', '宁德时代', '中兴', '海康威视',
  '招商银行', '中金', '中信证券', '华泰证券', '普华永道', '德勤', '安永', '毕马威', '新东方',
];

function inferSchoolTier(text) {
  if (/清北|清华|北大|北京大学|清华大学/.test(text)) return 'qingbei';
  if (/海本|美本|英本|澳本|港本/.test(text)) return 'overseas';
  if (/双非|二本|普通一本|四非|地方院校|省属高校|铁道大学|理工大学|财经大学|师范大学/.test(text) && !/985|华东师大|北京师大|武汉理工|上海财经|中南财经/.test(text)) {
    return 'non_double_first_class';
  }
  if (/末流985|中九|华五|c9|\b985\b/i.test(text)) return '985';
  if (/\b211\b|部属211|理工211|财经211/i.test(text)) return '211';
  if (/双一流/.test(text)) return 'double_first_class';
  return 'unknown';
}

function inferMajorFamily(text, mappedSkills, engine) {
  if (/计算机|软件工程|人工智能|网安|信息安全|科班|电子信息.*转码/.test(text)) return 'cs';
  if (/机械|自动化|车辆|材料|电子科学与技术|电气|光电|测控|机电|机器人/.test(text)) return 'mat_mech';
  if (/金融|经济|会计|财务|工商管理|市场营销|国贸|经管|商科/.test(text)) return 'econ';
  if (/汉语言|中文|新闻|传播|新媒体|英语|外语|法学|教育学|师范|历史|文科/.test(text)) return 'chinese';
  const skillSet = new Set(mappedSkills);
  if (['golang', 'spring_boot', 'java', 'cpp_modern', 'redis', 'web_frontend', 'llm_app_dev'].some(id => skillSet.has(id))) return 'cs';
  if (['embedded_c', 'mcu', 'rtos', 'plc', 'control_system', 'solidworks', 'pcb'].some(id => skillSet.has(id))) return 'mat_mech';
  if (['financial_modeling', 'valuation', 'financial_accounting', 'sql_bi'].some(id => skillSet.has(id))) return 'econ';
  if (['copywriting', 'new_media_ops', 'content_ops', 'teaching_design'].some(id => skillSet.has(id))) return 'chinese';
  return 'unknown';
}

function inferRankBucket(text) {
  const pctMatch = text.match(/(?:排名|绩点排名|综测|前)\s*([0-9]{1,2}(?:\.[0-9])?)\s*%/);
  if (pctMatch) {
    const val = Number(pctMatch[1]);
    if (val <= 10) return 'top10%';
    if (val <= 30) return '10%-30%';
    return '>30%';
  }
  const fracMatch = text.match(/(?:排名|rank)\s*[:：]?\s*(\d{1,3})\s*[/／]\s*(\d{2,4})/i);
  if (fracMatch) {
    const ratio = (Number(fracMatch[1]) / Number(fracMatch[2])) * 100;
    if (ratio <= 10) return 'top10%';
    if (ratio <= 30) return '10%-30%';
    return '>30%';
  }
  if (/边缘保研|保研边缘|擦线保研/.test(text)) return '10%-30%';
  return 'unknown';
}

function inferStartingState(text) {
  if (/跨专业|转码|跨保|跨考|文转|非科班转/.test(text)) return 'career_switch';
  if (/零实习|0实习|无实习|没有实习|一段实习都没有|空白简历/.test(text)) return 'zero_internship';
  if (/一段实习|两段实习|日常实习后|大厂实习|暑期转正/.test(text)) return 'has_internship';
  if (/开源项目|自研项目|竞赛国奖|实验室项目/.test(text)) return 'has_project';
  return 'unknown';
}

function inferPaths(text, defaultPaths = ['jiuye']) {
  const found = [];
  if (/保研|夏令营|预推免|九推|推免|直博|优营/.test(text)) found.push('baoyan');
  if (/考研|初试|复试|408|统考|国家线|择校|二战/.test(text)) found.push('kaoyan');
  if (/留学|港三|新二|英国g5|雅思|托福|round\s*1|美硕|港硕|欧陆/i.test(text)) found.push('liuxue');
  if (/秋招|春招|实习|面经|一面|二面|offer|校招|选调|考编|求职|简历/i.test(text)) found.push('jiuye');
  return found.length ? [...new Set(found)].slice(0, 4) : defaultPaths.slice(0, 2);
}

function inferCategory(text, isOfficialEdu = false) {
  if (isOfficialEdu || /夏令营通知|推免办法|招生简章|政策解读|网申开启/.test(text)) return 'camp_policy';
  if (/避坑|踩坑|血泪教训|千万别|防骗|黑名单|避雷/.test(text) && !/一面|二面/.test(text)) return 'pitfall';
  if (/一面|二面|三面|终面|面经|面试官|追问|手撕/.test(text)) return 'interview_exp';
  if (/课设|从零实现|项目改造|开源实战|手把手|架构重构/.test(text) && !/拿了.*offer/i.test(text)) return 'project_guide';
  return 'offer_retro';
}

function inferDirectionsAndFamilies(mappedSkillIds, text, engine) {
  const skillSet = new Set(mappedSkillIds);
  const dirs = new Set();
  const fams = new Set();
  for (const dir of engine.CAREER_DIRECTIONS || []) {
    let hitDir = (dir.skillIds || dir.coreSkills || []).some(id => skillSet.has(id));
    for (const fam of dir.families || []) {
      const famHit = (fam.skillIds || fam.coreSkills || []).some(id => skillSet.has(id)) ||
        (fam.roles || []).some(r => text.toLowerCase().includes(String(r).toLowerCase())) ||
        (fam.name && text.includes(fam.name.slice(0, 4)));
      if (famHit) {
        fams.add(fam.id);
        hitDir = true;
      }
    }
    if (hitDir) dirs.add(dir.id);
  }
  if (!dirs.size) {
    if (/产品经理|c端产品|b端产品/i.test(text)) {
      const pmDir = (engine.CAREER_DIRECTIONS || []).find(d => d.families?.some(f => f.id === 'product-operations'));
      if (pmDir) { dirs.add(pmDir.id); fams.add('product-operations'); }
    } else if (/运营|文案|新媒体/.test(text)) {
      const opDir = (engine.CAREER_DIRECTIONS || []).find(d => d.families?.some(f => f.id === 'editorial'));
      if (opDir) { dirs.add(opDir.id); fams.add('editorial'); }
    }
  }
  return {
    directionIds: [...dirs].slice(0, 4),
    familyIds: [...fams].slice(0, 4),
  };
}

function extractQuestionsFromText(text) {
  const lines = text.split(/\r?\n|[；;]/).map(l => l.replace(/^[-*•\d.、)）\s]+/, '').trim());
  const qs = [];
  for (const line of lines) {
    if (line.length >= 10 && line.length <= 140 && /[？?]$/.test(line) && !/需要.*吗|私信|关注/.test(line)) {
      if (!qs.includes(line)) qs.push(line);
      if (qs.length >= 5) break;
    }
  }
  return qs;
}

function extractStepsFromText(text, category, mappedSkillNames, paths) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/^[-*•\d.、)）#>\s]+/, '').trim());
  const candidates = lines.filter(l =>
    l.length >= 16 && l.length <= 120 &&
    /(?:建议|准备|梳理|复盘|整理|重点|投递|刷题|压测|对比|联系|修改|打磨|总结|先|第一步|第二步)/.test(l) &&
    !/评论区|点赞|收藏|私信/.test(l)
  );
  const unique = [...new Set(candidates)].slice(0, 4);
  if (unique.length >= 2) return unique;

  const skLabel = mappedSkillNames.slice(0, 2).join('与') || '核心专业技能';
  if (category === 'interview_exp') {
    return [
      `逐条复盘本场涉及的${skLabel}追问，写出『原理机制 + 项目真实数据 + 异常兜底』三段式回答提纲`,
      '对照简历中每段项目/课设经历，补齐至少1项可量化验证指标或压测/实验记录',
    ];
  }
  if (paths.includes('baoyan')) {
    return [
      '核对目标院校近两年夏令营与预推免入营排名区间，按冲刺/稳妥/保底三档建立时间表',
      '将现有最高含金量的1项课设、大创或科研训练整理为5分钟答辩PPT与一页式个人陈述摘要',
    ];
  }
  if (paths.includes('kaoyan')) {
    return [
      '查询目标院校专业课近三年报录比与真题题型结构，锁定每周固定模考与错题复盘时段',
      '按月拆解公共课与专业课复习轮次，避免多线摇摆挤占核心刷题整块时间',
    ];
  }
  if (paths.includes('liuxue')) {
    return [
      '对照目标地区Round1截止日倒排语言模考出分节点，确保在申请开放前完成合格语言成绩',
      '围绕目标项目课程设置筛选2段最具代表性的量化课程/项目经历打磨文书主线',
    ];
  }
  return [
    `围绕目标方向高频考察的${skLabel}，整理1份带可复现实验/运行结果的个人作品集证据`,
    '按周记录投递与笔面试反馈，针对高频卡壳问题定向回到课程或项目补齐短板',
  ];
}

export function computeGuidanceScore({ item, adRiskScore = 0, channelPrior = 0.85 }) {
  const stepsScore = item.keySteps.length >= 2 ? 1 : item.keySteps.length === 1 ? 0.5 : 0;
  const verifiableScore = (item.interviewQuestions.length > 0 || item.targetOrgs.length > 0 || item.mappedSkillIds.length >= 2) ? 1 : 0.4;
  const knownBaselineCount = Object.values(item.authorBaseline).filter(v => v && v !== 'unknown').length;
  const baselineScore = knownBaselineCount >= 2 ? 1 : knownBaselineCount === 1 ? 0.6 : 0.25;
  const corrobBonus = Math.min(1, Math.max(0, (item.corroborationCount - 1) / 3));
  const raw = 0.30 * stepsScore + 0.25 * verifiableScore + 0.20 * baselineScore + 0.15 * corrobBonus + 0.10 * channelPrior - 0.50 * adRiskScore;
  return Number(Math.min(1, Math.max(0, raw)).toFixed(2));
}

function buildActionTask({ category, mappedSkillNames, interviewQuestions, paths }) {
  const topSkill = mappedSkillNames[0] || '';
  if (category === 'interview_exp' && interviewQuestions.length > 0) {
    return {
      title: `针对「${interviewQuestions[0].slice(0, 26)}」完成口述复盘与项目追问演练`,
      estimatedHours: 2.5,
      deliverable: '面试复盘问答笔记与对应项目指标核对清单',
      targetModule: 'interview',
    };
  }
  if (category === 'project_guide' || topSkill) {
    return {
      title: `结合${topSkill || '目标方向'}实战要点，在经历工坊升级1项可核验项目/课设证据`,
      estimatedHours: 4,
      deliverable: '包含角色、动作与可验证量化指标的经历条目',
      targetModule: 'evidence',
    };
  }
  return {
    title: `对照该${paths.includes('baoyan') ? '推免' : paths.includes('kaoyan') ? '备考' : paths.includes('liuxue') ? '申请' : '求职'}经验复盘，排入本周关键准备时间块`,
    estimatedHours: 3,
    deliverable: '本周节点核对与材料准备清单',
    targetModule: 'conflict',
  };
}

export function extractExperienceDeterministic({
  url,
  title,
  text,
  platform,
  isOfficialEdu = false,
  extractMode = 'full_markdown',
  publishedAt = null,
  verifiedAt = new Date().toISOString().slice(0, 10),
  defaultPaths = ['jiuye'],
  adRiskScore = 0,
  engine,
}) {
  const channel = getExperienceChannel(platform);
  const safeTitle = redactExperiencePii(title || '').replace(/\s+/g, ' ').trim().slice(0, 150) || '实战经验复盘';
  const safeBody = redactExperiencePii(text || '');
  const fullText = `${safeTitle}\n${safeBody}`;

  const genericSet = engine.GENERIC_SKILL_IDS || new Set();
  const extractedSkills = engine.extractSkillsFromText(fullText)
    .map(s => s.skillId)
    .filter(id => engine.SKILL_BY_ID.has(id));
  const coreSkills = extractedSkills.filter(id => !genericSet.has(id));
  const mappedSkillIds = [...new Set(coreSkills.length ? coreSkills : extractedSkills)].slice(0, 6);
  const mappedSkillNames = mappedSkillIds.map(id => engine.skillName(id));

  const paths = inferPaths(fullText, defaultPaths);
  const category = inferCategory(fullText, isOfficialEdu);
  const { directionIds, familyIds } = inferDirectionsAndFamilies(mappedSkillIds, fullText, engine);
  const targetOrgs = KNOWN_ORGS.filter(org => fullText.includes(org)).slice(0, 4);

  const gradMatch = fullText.match(/\b(202[6-9]|2030)\s*届/);
  const targetGradYear = gradMatch ? Number(gradMatch[1]) : null;

  const authorBaseline = {
    schoolTier: inferSchoolTier(fullText),
    majorFamily: inferMajorFamily(fullText, mappedSkillIds, engine),
    rankBucket: inferRankBucket(fullText),
    startingState: inferStartingState(fullText),
  };

  const interviewQuestions = extractQuestionsFromText(safeBody);
  const keySteps = extractStepsFromText(safeBody, category, mappedSkillNames, paths);
  const pitfallLines = safeBody.split(/\r?\n/)
    .map(l => l.replace(/^[-*•\d.、)）\s]+/, '').trim())
    .filter(l => l.length >= 12 && l.length <= 120 && /(?:避坑|踩坑|注意不要|切忌|千万别|教训)/.test(l))
    .slice(0, 3);

  const firstMeaningfulLine = safeBody.split(/\r?\n|[。！!]/).map(s => s.trim()).find(s => s.length >= 18 && s.length <= 120);
  const tldr = (firstMeaningfulLine || `${safeTitle}：聚焦${mappedSkillNames.slice(0, 2).join('、') || '关键节点'}准备与实操复盘。`).slice(0, 140);

  const shortHash = createHash('sha256').update(url).digest('hex').slice(0, 8);
  const prefix = { nowcoder: 'nc', zhihu: 'zh', xiaohongshu: 'xhs', github_exp: 'gh', bilibili_edu: 'edu' }[platform] || 'exp';
  const trustTier = isOfficialEdu && extractMode === 'full_markdown' ? 'A_OFFICIAL' : 'B_EXPERIENCE';
  const actionTask = buildActionTask({ category, mappedSkillNames, interviewQuestions, paths });
  const clusterPrimary = familyIds[0] || directionIds[0] || paths[0] || 'general';
  const clusterSecondary = mappedSkillIds[0] || category;
  const corroborationCluster = `${clusterPrimary}:${clusterSecondary}`.toLowerCase().replace(/[^a-z0-9_:-]/g, '_');

  const item = {
    id: `exp_${prefix}_${shortHash}`,
    schemaVersion: '1.0',
    platform,
    platformLabel: isOfficialEdu ? '高校官方就业网' : (channel?.label || platform),
    trustTier,
    livenessStatus: 'active',
    category,
    title: safeTitle,
    tldr,
    paths,
    directionIds,
    familyIds,
    mappedSkillIds,
    targetOrgs,
    targetGradYear,
    authorBaseline,
    keySteps,
    interviewQuestions,
    pitfalls: pitfallLines,
    actionTask,
    guidanceScore: 0.7,
    corroborationCount: 1,
    corroborationCluster,
    citation: {
      sourceUrl: url,
      publishedAt: publishedAt && /^\d{4}-\d{2}-\d{2}/.test(publishedAt) ? publishedAt.slice(0, 10) : null,
      verifiedAt,
      extractMode,
      disclaimer: trustTier === 'A_OFFICIAL'
        ? '高校与主管部门公开政策通知原文提炼，具体执行以当年最新官方章程为准'
        : '社区个体实战样本，仅供参考，非官方硬门槛',
    },
  };

  item.guidanceScore = computeGuidanceScore({
    item,
    adRiskScore,
    channelPrior: channel?.prior ?? 0.85,
  });
  if (item.guidanceScore < 0.55 && item.trustTier !== 'A_OFFICIAL') {
    item.trustTier = 'C_CLUE';
  }
  return item;
}

export async function distillExperiencePost({
  url,
  title,
  text,
  platform,
  isOfficialEdu = false,
  extractMode = 'full_markdown',
  publishedAt = null,
  verifiedAt = new Date().toISOString().slice(0, 10),
  defaultPaths = ['jiuye'],
  adRiskScore = 0,
  engine,
  cloudProviders = [],
  llmCaller = null,
}) {
  const baseItem = extractExperienceDeterministic({
    url, title, text, platform, isOfficialEdu, extractMode,
    publishedAt, verifiedAt, defaultPaths, adRiskScore, engine,
  });

  if (!llmCaller || !cloudProviders.length || extractMode === 'search_snippet') {
    return baseItem;
  }

  try {
    const snippet = redactExperiencePii(`${title}\n${text}`).slice(0, 2600);
    const { text: rawReply } = await llmCaller({
      providers: cloudProviders,
      systemPrompt: '你是严谨的大学生升学与求职经验提炼助手。严禁编造原文未提及的作者背景或面经题；如发现实为卖课/私信引流软广则标记isSpam:true。仅输出合法JSON：{"isSpam":false,"tldr":"一句话核心方法论(<=80字)","keySteps":["具体可执行步骤1","步骤2"],"interviewQuestions":["原文真实面试追问(无则空数组)"],"pitfalls":["原文明确踩坑提示(无则空数组)"]}',
      userPrompt: `标题：${baseItem.title}\n正文片段：\n${snippet}`,
      maxTokens: 550,
      timeoutMs: 14000,
    });
    const jsonMatch = String(rawReply || '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return baseItem;
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed?.isSpam === true) {
      return { ...baseItem, trustTier: 'C_CLUE', guidanceScore: 0.2 };
    }
    const cleanList = (arr, maxItems, minLen = 8) => Array.isArray(arr)
      ? [...new Set(arr.map(x => redactExperiencePii(String(x || '')).replace(/\s+/g, ' ').trim()).filter(x => x.length >= minLen && x.length <= 160))].slice(0, maxItems)
      : [];
    const llmSteps = cleanList(parsed.keySteps, 4, 10);
    const llmQs = cleanList(parsed.interviewQuestions, 5, 8);
    const llmPitfalls = cleanList(parsed.pitfalls, 3, 8);
    const llmTldr = typeof parsed.tldr === 'string' && parsed.tldr.trim().length >= 12
      ? redactExperiencePii(parsed.tldr).replace(/\s+/g, ' ').trim().slice(0, 140)
      : baseItem.tldr;

    const enriched = {
      ...baseItem,
      tldr: llmTldr,
      keySteps: llmSteps.length >= 2 ? llmSteps : baseItem.keySteps,
      interviewQuestions: llmQs.length ? llmQs : baseItem.interviewQuestions,
      pitfalls: llmPitfalls.length ? llmPitfalls : baseItem.pitfalls,
    };
    enriched.actionTask = buildActionTask({
      category: enriched.category,
      mappedSkillNames: enriched.mappedSkillIds.map(id => engine.skillName(id)),
      interviewQuestions: enriched.interviewQuestions,
      paths: enriched.paths,
    });
    enriched.guidanceScore = computeGuidanceScore({
      item: enriched,
      adRiskScore,
      channelPrior: getExperienceChannel(platform)?.prior ?? 0.85,
    });
    if (enriched.guidanceScore < 0.55 && enriched.trustTier !== 'A_OFFICIAL') {
      enriched.trustTier = 'C_CLUE';
    }
    return enriched;
  } catch {
    return baseItem;
  }
}
