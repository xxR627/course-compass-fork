import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEmploymentCatalog } from './_employment-contract.mjs';
import { employmentEngine, jobLinkIdentity, normalizePosting, validateEmploymentData } from './_employment-data.mjs';
import { EXPERIENCE_CHANNELS } from './_experience-channels.mjs';
import { openExperienceDb } from './_experience-db.mjs';
import { defaultQuerySeeds } from './_experience-query-planner.mjs';
import { buildBaselineExperienceRecords } from './_experience-seed-baseline.mjs';
import { openAbroadDb } from './_abroad-db.mjs';
import { buildAbroadSnapshot } from './_abroad-snapshot.mjs';
import { buildBaselineAbroadCatalog } from './_abroad-seed-baseline.mjs';

const require = createRequire(import.meta.url);
const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(ROOT, '_cc-data.json');
const JOBS_DB = join(ROOT, '_research', 'jobs.db');
const CALENDAR_DB = join(ROOT, '_research', 'calendar.db');
const EXPERIENCES_DB = join(ROOT, '_research', 'experiences.db');
const SECTOR_FILE = join(ROOT, '_research', 'company-sector.json');
const JD_TEXT_DB = process.env.CC_JD_TEXT_DB ||
  'C:/Users/Administrator/.gemini/antigravity/brain/e7a3f14c-423f-445c-9da3-9e88637eb57f/scratch/jd_text.db';

const EXTRA_SKILL_DEFS = [
  { id: 'embedded_c', name: '嵌入式 C/C++', category: '工科', aliases: ['c/c++', 'c语言', '嵌入式c'] },
  { id: 'mcu', name: '单片机与 MCU', category: '工科', aliases: ['单片机', 'mcu', 'stm32', 'arm cortex'] },
  { id: 'rtos', name: '实时操作系统', category: '工科', aliases: ['rtos', 'freertos', 'rt-thread'] },
  { id: 'industrial_bus', name: '工业通信', category: '工科', aliases: ['can总线', 'can 总线', 'can bus', 'modbus', 'ethercat'] },
  { id: 'analog_digital', name: '模拟与数字电路', category: '工科', aliases: ['模拟电路', '数字电路', '模电', '数电'] },
  { id: 'pcb', name: 'PCB 设计', category: '工科', aliases: ['pcb', 'altium', '立创eda', 'kicad'] },
  { id: 'plc', name: 'PLC 控制', category: '工科', aliases: ['plc', 'tia portal', '梯形图'] },
  { id: 'control_system', name: '运动与自动控制', category: '工科', aliases: ['自动控制', '运动控制', '机器人控制', '电机控制', 'simulink', 'matlab'] },
  { id: 'golang', name: 'Go 语言 / 微服务', category: '后端', aliases: ['golang', 'go语言', 'go 开发', 'go开发', 'gin框架', 'grpc'] },
  { id: 'cpp_modern', name: '现代 C++ / 高性能开发', category: '编程', aliases: ['modern c++', 'c++11', 'c++17', 'c++20', 'c++开发', '高性能开发', 'stl'] },
  { id: 'redis', name: 'Redis 与高并发缓存', category: '后端', aliases: ['redis', '缓存击穿', '缓存穿透', '分布式锁', 'memcached'] },
  { id: 'mq_kafka', name: '消息队列与异步架构', category: '后端', aliases: ['kafka', 'rabbitmq', 'rocketmq', '消息队列', 'pulsar'] },
  { id: 'cloud_k8s', name: '云原生与 Kubernetes', category: '工程', aliases: ['k8s', 'kubernetes', '云原生', 'helm', 'ci/cd', 'cicd', 'github actions'] },
  { id: 'computer_vision', name: '计算机视觉与 OpenCV', category: 'AI', aliases: ['计算机视觉', 'opencv', 'yolo', '目标检测', '图像识别', 'cv算法', '三维重建', 'slam视觉'] },
  { id: 'ros_slam', name: 'ROS2 与机器人导航', category: '工科', aliases: ['ros2', 'ros ', 'slam', '路径规划', '导航算法', 'gazebo', 'moveit'] },
  { id: 'fpga_verilog', name: 'FPGA 与数字 IC (Verilog)', category: '工科', aliases: ['fpga', 'verilog', 'systemverilog', '数字ic', 'ic验证', 'vivado', 'rtl'] },
  { id: 'ai_agent_workflow', name: 'AI Agent 与工作流编排', category: 'AI', aliases: ['dify', 'coze', 'langgraph', 'mcp协议', '工作流编排', '智能体编排', 'ai工作流', 'function calling'] },
  { id: 'sql_bi', name: 'BI 看板与数据可视化', category: '数据', aliases: ['tableau', 'powerbi', 'power bi', 'superset', 'bi看板', '飞书多维表格'] },
  { id: 'growth_ops', name: '增长投放与漏斗实验', category: '商科', aliases: ['增长运营', '用户增长', 'a/b测试', 'ab测试', 'roi分析', '小红书种草', '信息流投放', '千川'] },
];

const EXTRA_ALIAS_PATCH = {
  'netty': { skillId: 'spring_boot', subTag: 'Netty' },
  '微服务': { skillId: 'spring_boot', subTag: '微服务' },
  'next.js': { skillId: 'web_frontend', subTag: 'Next.js' },
  'nextjs': { skillId: 'web_frontend', subTag: 'Next.js' },
  'tailwind': { skillId: 'web_frontend', subTag: 'TailwindCSS' },
  'vite': { skillId: 'web_frontend', subTag: 'Vite' },
  'playwright': { skillId: 'software_testing', subTag: 'Playwright' },
  '大模型应用': { skillId: 'llm_app_dev' },
  'langchain': { skillId: 'llm_app_dev', subTag: 'LangChain' },
  'rag': { skillId: 'llm_app_dev', subTag: 'RAG' },
};

const NEW_SKILL_IDS = new Set(EXTRA_SKILL_DEFS.slice(8).map(s => s.id));

const DEGREE_ZH = { associate: '大专', bachelor: '本科', master: '硕士', phd: '博士' };
const DEGREE_MAP = {
  '大专': 'associate', '专科': 'associate', '高职': 'associate',
  '本科': 'bachelor', '大学本科': 'bachelor', '学士': 'bachelor',
  '硕士': 'master', '研究生': 'master',
  '博士': 'phd',
};

const COMPANY_INDUSTRY_OVERRIDES = {
  '腾讯': '互联网与软件', '阿里巴巴': '互联网与软件', '字节跳动': '互联网与软件',
  '美团': '互联网与软件', '京东': '互联网与软件', '百度': '互联网与软件',
  '网易': '互联网与软件', '小米': '消费电子与智能硬件', '华为': '通信与电子硬件',
  '蔚来': '新能源汽车', '理想汽车': '新能源汽车', '小鹏汽车': '新能源汽车', '比亚迪': '新能源汽车',
  '奇瑞汽车': '汽车与智能制造', '博世': '汽车与工业自动化', '大陆集团': '汽车与工业自动化',
  '昆仑芯': 'AI芯片与半导体', '欣旺达': '新能源电池与储能', '泰康': '金融与保险',
  '中国人保': '金融与保险', '中国人民保险': '金融与保险', '中国人寿': '金融与保险',
  '新东方': '教育科技与咨询', '海信': '通信与电子硬件', '大疆': '智能硬件与机器人',
  '普渡机器人': '智能硬件与机器人',
};

function cleanIndustry(raw, company) {
  if (COMPANY_INDUSTRY_OVERRIDES[company]) return COMPANY_INDUSTRY_OVERRIDES[company];
  if (!raw || typeof raw !== 'string') return null;
  if (raw.startsWith('省域·')) return null;
  return raw;
}

function isValidSalary(sal, jdText) {
  if (!sal || !jdText) return false;
  return sal.min <= sal.max &&
    sal.monthlyMin <= sal.monthlyMax &&
    typeof sal.raw === 'string' &&
    typeof sal.sourceSpan === 'string' &&
    sal.sourceSpan.includes(sal.raw) &&
    jdText.includes(sal.sourceSpan);
}

function normalizeCategory(rawCat, title) {
  const t = String(title || '').toLowerCase();
  const c = String(rawCat || '').trim();
  if (['技术', '产品', '设计', '市场', '职能', '运营', '金融', '市场销售', '工程制造', '医药', '教育培训', '管培', '科研', '项目管理'].includes(c)) return c;
  if (/研发|开发|工程师|算法|架构|测试|运维|前端|后端|全栈|数据|ai|llm|芯片|硬件|嵌入式|ic|fpga/i.test(c + ' ' + t)) {
    if (/硬件|芯片|嵌入式|结构|机械|电气|汽车|电池|plc|fpga/i.test(t) && !/软件|后端|前端|java|golang/.test(t)) return '工程制造';
    return '技术';
  }
  if (/产品|pm/i.test(c + ' ' + t)) return '产品';
  if (/运营|新媒体|内容|编辑|策划/i.test(c + ' ' + t)) return '运营';
  if (/设计|ui|ux|交互|视觉|工业设计/i.test(c + ' ' + t)) return '设计';
  if (/金融|投研|证券|银行|风控|审计|财务|会计/i.test(c + ' ' + t)) return '金融';
  if (/市场|公关|品牌|营销|销售|商务|管培/i.test(c + ' ' + t)) return '市场销售';
  if (/教育|教研|老师|讲师/i.test(c + ' ' + t)) return '教育培训';
  if (/人力|行政|法务|合规|hr|职能/i.test(c + ' ' + t)) return '职能';
  return '其他';
}

function inferMajors(skills, title, category) {
  const skillSet = new Set(skills.map(s => s.skillId));
  const t = String(title || '');
  const majors = new Set();
  const csSkills = ['python', 'java', 'spring_boot', 'golang', 'cpp_modern', 'redis', 'mq_kafka', 'cloud_k8s', 'web_frontend', 'llm_app_dev', 'ai_agent_workflow', 'machine_learning', 'computer_vision', 'algorithms', 'data_structures', 'os', 'computer_networks', 'database_design', 'sql_rdbms', 'software_testing'];
  const matSkills = ['embedded_c', 'mcu', 'rtos', 'industrial_bus', 'analog_digital', 'pcb', 'plc', 'control_system', 'ros_slam', 'fpga_verilog', 'cad_drawing', 'solidworks', 'finite_element', 'heat_treatment', 'materials_science', 'mechanics_of_materials', 'quality_control'];
  const econSkills = ['financial_modeling', 'valuation', 'financial_accounting', 'quantitative_analysis', 'consulting_framework', 'market_research', 'competitive_analysis', 'sql_bi', 'growth_ops', 'marketing'];
  const chnSkills = ['copywriting', 'new_media_ops', 'content_ops', 'official_writing', 'brand_pr', 'public_speaking', 'logic_expression'];

  if (csSkills.some(id => skillSet.has(id))) majors.add('cs');
  if (matSkills.some(id => skillSet.has(id)) || /硬件|机械|车辆|电子|嵌入式|控制|芯片|电池|结构/.test(t)) majors.add('mat_mech');
  if (econSkills.some(id => skillSet.has(id)) || category === '金融') majors.add('econ');
  if (chnSkills.some(id => skillSet.has(id)) || ['运营', '市场', '市场销售', '教育培训', '职能'].includes(category)) majors.add('chinese');
  if (!majors.size) {
    if (category === '技术') majors.add('cs');
    else if (category === '工程制造') majors.add('mat_mech');
    else majors.add('econ');
  }
  return [...majors];
}

function upgradePersonas(data) {
  const map = new Map((data.personas || []).map(p => [p.id, p]));

  const chn = map.get('p_chinese');
  if (chn) {
    chn.tagline = '双非汉语言文学大三 · 公众号+小红书独立运营矩阵 + 内容增长实战 · 冲刺内容运营/品牌公关/产品运营';
    const evs = chn.evidences || [];
    for (const ev of evs) {
      if (ev.id === 'ev_p1_wechat') {
        ev.type = '项目';
        ev.title = '独立内容矩阵与校园公众号运营项目';
        ev.description = '独立运营学院公众号与小红书垂直账号，搭建选题日历与 A/B 标题测试模板，单学期累计发布 28 篇。';
        ev.skillIds = ['new_media_ops', 'content_ops', 'copywriting', 'growth_ops'];
        ev.hasPortfolio = true;
        ev.verificationStatus = 'user_confirmed';
        ev.verified = true;
        ev.metrics = [
          { label: '累计发布篇数', value: '28 篇', verified: true },
          { label: '单篇最高阅读', value: '6,400+', verified: true },
          { label: '平均完读率提升', value: '+24%', verified: false },
        ];
      } else if (ev.id === 'ev_p1_milktea') {
        ev.type = '课设';
      } else if (ev.id === 'ev_p1_debate') {
        ev.type = '竞赛';
      } else if (ev.id === 'ev_p1_assistant') {
        ev.type = '实习';
      }
    }
  }

  const cs = map.get('p_cs');
  if (cs) {
    cs.tagline = '985 计算机大二升大三 · 自研高并发 Go/Java 开源项目 + 蓝桥杯省一 · 目标后端开发/AI工程/全栈校招与实习';
    cs.completedCourseIds = ['cs_intro', 'cs_ds', 'cs_db', 'cs_java', 'cs_os', 'cs_net', 'cs_statistics'];
    cs.weeklyHours = 18;
    cs.intern = '2027-07~2027-09 暑期';
    cs.evidences = [
      {
        id: 'ev_p2_library',
        title: '高并发秒杀与分布式订单系统（GitHub 开源自研项目）',
        description: '脱离课设重写为 Spring Boot + Redis Lua 分布式锁 + Kafka 异步削峰微服务，Docker/Linux 容器化部署与压测。',
        courseId: null,
        type: '项目',
        skillIds: ['java', 'spring_boot', 'redis', 'mq_kafka', 'sql_rdbms', 'database_design', 'linux'],
        hasPortfolio: true,
        artifactUrl: 'https://github.com/course-compass-demo/flash-order-engine',
        verified: true,
        verificationStatus: 'user_confirmed',
        quality: 0.94,
        observedAt: '2026-10-15',
        metrics: [
          { label: '压测峰值 QPS', value: '3,800 req/s', verified: true },
          { label: 'P99 延迟', value: '28 ms', verified: true },
          { label: '超卖率', value: '0%', verified: true },
        ],
      },
      {
        id: 'ev_p2_ds',
        title: '第十七届蓝桥杯全国软件大赛省赛一等奖（Java 组）',
        description: '独立完成动态规划、图论最短路与线段树高频题型 180+ 道自测题库整理，获省一等奖并入围国赛。',
        courseId: null,
        type: '竞赛',
        skillIds: ['data_structures', 'algorithms', 'java', 'python'],
        hasPortfolio: true,
        verified: true,
        verificationStatus: 'user_confirmed',
        quality: 0.92,
        observedAt: '2026-06-20',
        metrics: [
          { label: '获奖等级', value: '省赛一等奖', verified: true },
          { label: '算法刷题量', value: '320+ 题', verified: true },
        ],
      },
      {
        id: 'ev_p2_agent',
        title: '校企实训 AI Agent 知识库检索工具（RAG + Function Calling）',
        description: '基于 Python FastAPI 与 RAG 向量检索搭建课程资料问答机器人，支持结构化引用与离线评测。',
        courseId: null,
        type: '项目',
        skillIds: ['python', 'llm_app_dev', 'ai_agent_workflow', 'computer_networks'],
        hasPortfolio: true,
        verified: true,
        verificationStatus: 'user_confirmed',
        quality: 0.90,
        observedAt: '2026-11-01',
        metrics: [
          { label: '问答引用准确率', value: '91%', verified: true },
        ],
      },
    ];
  }

  const econ = map.get('p_econ');
  if (econ) {
    econ.tagline = '财经 211 经管大三 · 券商行研远程实习 + 商赛路演 + SQL/BI 商业分析 · 主攻商业分析/金融投研/产品';
    econ.weeklyHours = 16;
    econ.intern = '2027-07~2027-09 暑期';
    for (const ev of econ.evidences || []) {
      if (ev.id === 'ev_p3_valuation') {
        ev.type = '实习';
        ev.title = '申万宏观与消费组行研实习（上市公司 DCF 与同业估值）';
        ev.description = '协助研究员撰写消费品龙头财报拆解与 DCF/EV-EBITDA 估值模型，输出 3 份行业周报与敏感性表。';
        ev.skillIds = ['financial_modeling', 'valuation', 'financial_accounting', 'sql_bi'];
        ev.hasPortfolio = true;
        ev.verificationStatus = 'user_confirmed';
        ev.verified = true;
        ev.quality = 0.93;
      } else if (ev.id === 'ev_p3_survey') {
        ev.type = '项目';
        ev.skillIds = ['market_research', 'competitive_analysis', 'marketing', 'growth_ops'];
      } else if (ev.id === 'ev_p3_case') {
        ev.type = '竞赛';
        ev.verificationStatus = 'user_confirmed';
        ev.verified = true;
        ev.metrics = [{ label: '获奖名次', value: '校级一等奖', verified: true }];
      }
    }
  }

  const mat = map.get('p_mat');
  if (mat) {
    mat.tagline = '普通本科材料/机械大三 · 暂无实习与硬核项目（冷启动课设包装过渡示范）· 观望考研 vs 新能源车企/制造工艺岗';
    for (const ev of mat.evidences || []) {
      ev.type = '课设';
    }
  }
}

function buildCampusCalendar(calDb) {
  if (!existsSync(calDb)) return [];
  const db = new DatabaseSync(calDb, { readOnly: true });
  const rows = db.prepare(`
    SELECT e.id, e.group_name, e.company, e.project_type, e.grad_year, e.tracks,
           e.apply_start, e.apply_end, e.cities, e.apply_url, e.source_url,
           e.open_jobs, e.as_of, e.notes,
           t.sector AS sector, l.http_status AS http_status
    FROM entry e
    LEFT JOIN target t ON e.group_name = t.name
    LEFT JOIN link_check l ON COALESCE(e.apply_url, e.source_url) = l.url
    WHERE (e.apply_url LIKE 'https://%' OR e.apply_url LIKE 'http://%' OR e.source_url LIKE 'https://%')
      AND (l.http_status = 200 OR e.origin = 'manual')
      AND COALESCE(e.company, e.group_name, '') NOT IN ('我爱我家','来伊份','星巴克','喜茶','茶颜悦色','蜜雪冰城','百胜中国')
    ORDER BY (CASE WHEN e.project_type IN ('校招','秋招正式批','提前批','暑期实习','春招') THEN 1 ELSE 0 END) DESC,
             (CASE WHEN e.grad_year IN (2027, 2028) THEN 1 ELSE 0 END) DESC,
             (CASE WHEN e.apply_end IS NOT NULL THEN 1 ELSE 0 END) DESC,
             (CASE WHEN e.open_jobs IS NOT NULL AND e.open_jobs > 0 THEN 1 ELSE 0 END) DESC,
             COALESCE(e.open_jobs, 0) DESC,
             e.as_of DESC
    LIMIT 800
  `).all();

  const seenCompanies = new Set();
  const out = [];
  for (const r of rows) {
    const applyUrl = r.apply_url && /^https?:\/\//i.test(r.apply_url) ? r.apply_url : r.source_url;
    if (!applyUrl || !/^https?:\/\//i.test(applyUrl)) continue;
    const company = (r.company || r.group_name || '').trim();
    if (!company) continue;
    const compKey = (r.group_name || company).trim();
    if (seenCompanies.has(compKey)) continue;
    seenCompanies.add(compKey);

    let tracks = [];
    try {
      const parsed = JSON.parse(r.tracks || '[]');
      if (Array.isArray(parsed)) {
        tracks = [...new Set(parsed.map(x => typeof x === 'string' ? x : (x?.direction || '')).filter(Boolean))];
      }
    } catch {}
    let cities = [];
    try {
      const parsed = JSON.parse(r.cities || '[]');
      if (Array.isArray(parsed)) cities = parsed.filter(c => typeof c === 'string' && c.trim()).slice(0, 8);
    } catch {}

    out.push({
      id: r.id,
      company,
      sector: r.sector || cleanIndustry(null, company) || null,
      projectType: r.project_type || '校招',
      gradYear: r.grad_year ? Number(r.grad_year) : null,
      tracks,
      applyStart: r.apply_start || null,
      applyEnd: r.apply_end || null,
      cities,
      applyUrl,
      sourceUrl: r.source_url && /^https?:\/\//i.test(r.source_url) ? r.source_url : null,
      openJobs: r.open_jobs != null ? Number(r.open_jobs) : null,
      asOf: r.as_of || null,
      notes: r.notes ? String(r.notes).slice(0, 220) : null,
    });
    if (out.length >= 180) break;
  }
  db.close();
  return out;
}

function sampleWarehousePostings(data, engine, sectorMap) {
  if (!existsSync(JOBS_DB) || !existsSync(JD_TEXT_DB)) {
    console.warn('Skipping warehouse sampling: DB missing');
    return [];
  }
  const jdb = new DatabaseSync(JOBS_DB, { readOnly: true });
  jdb.exec(`ATTACH DATABASE '${JD_TEXT_DB.replace(/'/g, "''")}' AS jdt`);

  const existingIds = new Set(data.jobs.map(j => j.id));
  const existingUrls = new Set(data.jobs.map(j => jobLinkIdentity(j)).filter(Boolean));
  const existingIdentities = new Set(data.jobs.map(j => engine.postingIdentity(j)));

  // First cross-reference existing jobs against jobs.db for grad_year/degree_min enrichment
  const urlMetaStmt = jdb.prepare('SELECT url, grad_year, degree_min FROM job WHERE url = ? LIMIT 1');
  for (const job of data.jobs) {
    const row = job.postUrl ? urlMetaStmt.get(job.postUrl) : null;
    const baseGate = { ...(job.hardGate || {}) };
    if (row?.grad_year && !(baseGate.graduationYears || []).length) {
      baseGate.graduationYears = [Number(row.grad_year)];
    }
    if (row?.degree_min && !baseGate.minDegree && DEGREE_MAP[row.degree_min]) {
      baseGate.minDegree = DEGREE_MAP[row.degree_min];
    }
    job.hardGate = engine.extractHardGateObject(job.jdText, baseGate);
    if (!job.degree && job.hardGate.minDegree && DEGREE_ZH[job.hardGate.minDegree]) {
      job.degree = DEGREE_ZH[job.hardGate.minDegree];
    }
    if (!job.industry) {
      job.industry = cleanIndustry(sectorMap[job.org], job.org);
    }
    if (!job.salary) {
      const sal = engine.salaryParse(job.jdText);
      if (isValidSalary(sal, job.jdText)) job.salary = sal;
    }
    // Add any newly recognized v2.0 taxonomy skills from JD text without disturbing existing weighted order
    const detected = engine.extractSkillsFromText(`${job.title || ''}\n${job.jdText || ''}`)
      .filter(s => NEW_SKILL_IDS.has(s.skillId));
    const have = new Set((job.skills || []).map(s => s.skillId));
    for (const d of detected) {
      if (!have.has(d.skillId) && job.skills.length < 12) {
        job.skills.push({ skillId: d.skillId, weight: 0.45 });
        have.add(d.skillId);
      }
    }
  }

  const blockedSources = `'beisen-5i5j','beisen-laiyifen','beisen-starbucks','beisen-heytea','beisen-yumccrewtas','beisen-chaPanda','beisen-mixue'`;
  // Bucket 1: Salary-bearing open campus/intern jobs
  const salaryRows = jdb.prepare(`
    SELECT j.id AS wh_id, c.name AS company, j.source_id, j.source_job_id, j.url, j.title,
           j.category, j.subcategory, j.recruit_type, j.grad_year, j.batch, j.cities,
           j.degree_min, j.last_seen, j.apply_end, j.publish_at,
           t.description, t.requirements
    FROM job j
    JOIN company c ON j.company_id = c.id
    JOIN jdt.job_text t ON t.job_id = j.id
    WHERE j.closed_at IS NULL
      AND j.recruit_type IN ('campus', 'intern')
      AND j.source_id NOT IN (${blockedSources})
      AND (j.url LIKE 'https://%' OR j.url LIKE 'http://%')
      AND length(COALESCE(t.description,'') || COALESCE(t.requirements,'')) BETWEEN 120 AND 5500
      AND (
        t.description LIKE '%元/天%' OR t.requirements LIKE '%元/天%'
        OR t.description LIKE '%K/月%' OR t.requirements LIKE '%K/月%'
        OR t.description LIKE '%k/月%' OR t.requirements LIKE '%k/月%'
        OR t.description LIKE '%万/年%' OR t.requirements LIKE '%万/年%'
        OR t.description LIKE '%日薪%' OR t.requirements LIKE '%日薪%'
        OR t.description LIKE '%月薪%' OR t.requirements LIKE '%月薪%'
      )
    ORDER BY (CASE WHEN j.grad_year IN (2027, 2028) THEN 1 ELSE 0 END) DESC, j.last_seen DESC
    LIMIT 1800
  `).all();

  // Bucket 2: Diverse top tech / EV / manufacturing / finance / humanities open roles + broad diverse backup
  const topCompaniesRows = jdb.prepare(`
    SELECT j.id AS wh_id, c.name AS company, j.source_id, j.source_job_id, j.url, j.title,
           j.category, j.subcategory, j.recruit_type, j.grad_year, j.batch, j.cities,
           j.degree_min, j.last_seen, j.apply_end, j.publish_at,
           t.description, t.requirements
    FROM job j
    JOIN company c ON j.company_id = c.id
    JOIN jdt.job_text t ON t.job_id = j.id
    WHERE j.closed_at IS NULL
      AND j.recruit_type IN ('campus', 'intern')
      AND j.source_id NOT IN (${blockedSources})
      AND (j.url LIKE 'https://%' OR j.url LIKE 'http://%')
      AND length(COALESCE(t.description,'') || COALESCE(t.requirements,'')) BETWEEN 140 AND 5500
    ORDER BY (CASE WHEN c.name IN ('字节跳动','阿里巴巴','美团','腾讯','蔚来','奇瑞汽车','昆仑芯','欣旺达','小米','华为','百度','网易','新东方','中国人保','泰康','中国兵器工业集团','比亚迪','理想汽车','大疆','小红书','蚂蚁集团','拼多多','京东','携程','中兴通讯') THEN 0 ELSE 1 END),
             (CASE WHEN j.grad_year IN (2027, 2028) THEN 1 ELSE 0 END) DESC,
             j.last_seen DESC
    LIMIT 5000
  `).all();

  jdb.close();

  const added = [];
  const companyCount = new Map();
  const catCount = new Map();
  let addedWithSalary = 0;

  const tryAdd = (r, requireSalary) => {
    if (!r.url || !/^https?:\/\//i.test(r.url)) return false;
    const company = String(r.company || '').trim();
    if (!company || (companyCount.get(company) || 0) >= 12) return false;
    const desc = String(r.description || '').trim();
    const reqs = String(r.requirements || '').trim();
    const jdText = [desc, reqs ? '【任职要求】\n' + reqs : ''].filter(Boolean).join('\n\n').slice(0, 5800).trim();
    if (jdText.length < 120) return false;

    const sal = engine.salaryParse(jdText);
    if (requireSalary && !isValidSalary(sal, jdText)) return false;

    const rawSkills = engine.extractSkillsFromText(`${r.title}\n${jdText}`);
    if (rawSkills.length < 2) return false;
    const skills = rawSkills.slice(0, 8).map((s, idx) => ({ skillId: s.skillId, weight: idx < 2 ? 0.85 : 0.45 }));

    const category = normalizeCategory(r.category, r.title);
    if ((catCount.get(category) || 0) >= 90) return false;

    let cities = [];
    try {
      const parsed = JSON.parse(r.cities || '[]');
      if (Array.isArray(parsed)) cities = parsed.map(x => String(x).trim()).filter(Boolean).slice(0, 6);
    } catch {}
    if (!cities.length) cities = ['全国'];

    const degCode = DEGREE_MAP[String(r.degree_min || '').trim()] || null;
    const hardGate = engine.extractHardGateObject(jdText, {
      graduationYears: r.grad_year ? [Number(r.grad_year)] : [],
      minDegree: degCode,
    });
    const lastSeen = (r.last_seen && /^\d{4}-\d{2}-\d{2}/.test(r.last_seen)) ? r.last_seen.slice(0, 10) : '2026-11-19';
    const publishDate = (r.publish_at && /^\d{4}-\d{2}-\d{2}/.test(r.publish_at)) ? r.publish_at.slice(0, 10) : null;
    const applyEndAt = (r.apply_end && /^\d{4}-\d{2}-\d{2}/.test(r.apply_end)) ? r.apply_end.slice(0, 10) : undefined;
    const hash8 = createHash('sha1').update(`${r.source_id}:${r.source_job_id}:${r.url}`).digest('hex').slice(0, 10);
    const id = `wh_${hash8}`;
    if (existingIds.has(id)) return false;

    const draft = {
      id,
      schemaVersion: engine.EMPLOYMENT_SCHEMA_VERSION,
      title: String(r.title || '').trim(),
      org: company,
      orgLabel: `${company} · ${r.recruit_type === 'intern' ? '实习' : '校招'}`,
      category,
      subCategory: r.subcategory || r.batch || category,
      recruitmentType: r.recruit_type === 'intern' ? '实习' : '校招',
      jobType: r.recruit_type,
      locations: cities,
      experience: r.recruit_type === 'intern' ? '在校实习' : '应届',
      degree: DEGREE_ZH[hardGate.minDegree] || null,
      majors: inferMajors(skills, r.title, category),
      skills,
      bonusEvidenceTypes: ['自研可运行项目仓库 / 竞赛获奖 / 实习交付物'],
      hardGate,
      jdText,
      postUrl: r.url,
      salary: isValidSalary(sal, jdText) ? sal : null,
      industry: cleanIndustry(sectorMap[company], company),
      snapshotDate: lastSeen,
      citation: {
        sourceName: `${company}公开招聘 (${r.source_id})`,
        sourceUrl: r.url,
        publishDate,
        verifiedDate: lastSeen,
        trustTier: 'A_OFFICIAL',
        note: '校招仓公开职位实测核验入库，投递前请点击官方入口复核最新在招状态。',
      },
      sourceSnapshot: {
        sourceId: `src_wh_${String(r.source_id || 'official').replace(/[^a-z0-9_-]/gi, '_')}`,
        snapshotAt: lastSeen,
        lastSeenAt: lastSeen,
        status: 'observed_active',
        linkScope: 'job_detail',
        ...(applyEndAt ? { applyEndAt } : {}),
      },
    };

    const normalized = normalizePosting(draft, engine);
    if (!isValidSalary(normalized.salary, normalized.jdText)) normalized.salary = null;
    const linkKey = jobLinkIdentity(normalized);
    const idKey = engine.postingIdentity(normalized);
    if ((linkKey && existingUrls.has(linkKey)) || existingIdentities.has(idKey)) return false;

    existingIds.add(id);
    if (linkKey) existingUrls.add(linkKey);
    existingIdentities.add(idKey);
    companyCount.set(company, (companyCount.get(company) || 0) + 1);
    catCount.set(category, (catCount.get(category) || 0) + 1);
    if (normalized.salary) addedWithSalary++;
    added.push(normalized);
    return true;
  };

  for (const r of salaryRows) {
    if (added.length >= 165) break;
    tryAdd(r, true);
  }
  for (const r of topCompaniesRows) {
    if (added.length >= 300) break;
    tryAdd(r, false);
  }
  console.log(`Sampled ${added.length} new open warehouse jobs (${addedWithSalary} with verified salary)`);
  return added;
}

function main() {
  const experiencesOnly = process.argv.includes('--experiences-only');
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  const sectorMap = existsSync(SECTOR_FILE) ? JSON.parse(readFileSync(SECTOR_FILE, 'utf8')) : {};

  if (!experiencesOnly) {
    // 1. Sync new v2.0 skills and aliases
    const existingSkillIds = new Set(data.skills.map(s => s.id));
    for (const s of EXTRA_SKILL_DEFS) {
      if (!existingSkillIds.has(s.id)) {
        data.skills.push({ id: s.id, name: s.name, category: s.category });
        existingSkillIds.add(s.id);
      }
      for (const a of s.aliases) {
        if (!data.aliases[a]) data.aliases[a] = { skillId: s.id };
      }
    }
    for (const [k, v] of Object.entries(EXTRA_ALIAS_PATCH)) {
      if (!data.aliases[k]) data.aliases[k] = v;
    }
  }

  // Re-initialize engine with updated skill taxonomy
  const engine = employmentEngine(data);

  if (!experiencesOnly) {
    // 2. Backfill existing 398 + add ~300 diverse open warehouse jobs
    const newJobs = sampleWarehousePostings(data, engine, sectorMap);
    data.jobs.push(...newJobs);

    // 3. Populate verified campusCalendar (180 entries)
    data.campusCalendar = buildCampusCalendar(CALENDAR_DB);

    // 4. Upgrade personas (coursework fallback on p_mat vs real projects/competitions/internships on p_chinese, p_cs, p_econ)
    upgradePersonas(data);
  }

  // 4.5. Sync & sample balanced Top-300 ExperienceIntel snapshot from _research/experiences.db
  const expDb = openExperienceDb(EXPERIENCES_DB);
  let totalWarehouseExp = 0;
  try {
    expDb.ensureSources(EXPERIENCE_CHANNELS);
    if (!expDb.listQuerySeeds().length) expDb.upsertQuerySeeds(defaultQuerySeeds());
    expDb.upsertExperiences(buildBaselineExperienceRecords(new Date().toISOString().slice(0, 10)));
    expDb.recomputeCorroboration({ windowDays: 30, now: new Date() });
    const allActive = expDb.listExperiences({ limit: 500, activeOnly: true }).map(r => r.item);
    totalWarehouseExp = allActive.length;
    const picked = [];
    const seenExp = new Set();
    for (const pathKey of ['jiuye', 'baoyan', 'kaoyan', 'liuxue']) {
      for (const it of allActive) {
        if (seenExp.has(it.id) || !it.paths.includes(pathKey)) continue;
        picked.push(it);
        seenExp.add(it.id);
        if (picked.filter(x => x.paths.includes(pathKey)).length >= 60) break;
      }
    }
    for (const it of allActive) {
      if (picked.length >= 260) break;
      if (!seenExp.has(it.id)) {
        picked.push(it);
        seenExp.add(it.id);
      }
    }
    data.experienceIntel = {
      schemaVersion: '1.0',
      updatedAt: new Date().toISOString().slice(0, 10),
      totalWarehouseCount: totalWarehouseExp,
      items: picked.slice(0, 260),
    };
  } finally {
    expDb.close();
  }

  const abroadPath = join(ROOT, '_research', 'abroad.db');
  const abroadDb = openAbroadDb(abroadPath);
  try {
    const baselineAbroad = buildBaselineAbroadCatalog('2026-11-27');
    if (abroadDb.listPrograms({ limit: 100 }).length < baselineAbroad.programs.length) {
      abroadDb.upsert(baselineAbroad);
    }
    const snapshot = buildAbroadSnapshot(abroadDb);
    if (snapshot.programs.length) data.studyAbroad = snapshot;
    console.log(`[4b] Enriched studyAbroad snapshot: ${snapshot.universities.length} universities, ${snapshot.programs.length} programs, ${snapshot.cases.length} cases`);
  } finally {
    abroadDb.close();
  }

  // 5. Strict validation before write (throws if invalid)
  validateEmploymentData(data);

  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');

  const withSal = data.jobs.filter(j => j.salary != null).length;
  const withGrad = data.jobs.filter(j => (j.hardGate?.graduationYears || []).length > 0).length;
  const withDeg = data.jobs.filter(j => j.hardGate?.minDegree != null).length;
  const withInd = data.jobs.filter(j => j.industry != null).length;
  console.log(JSON.stringify({
    ok: true,
    totalSkills: data.skills.length,
    totalJobs: data.jobs.length,
    withSalary: withSal,
    withGradYear: withGrad,
    withMinDegree: withDeg,
    withIndustry: withInd,
    campusCalendar: data.campusCalendar.length,
    experienceIntel: data.experienceIntel?.items?.length || 0,
  }, null, 2));
}

main();
