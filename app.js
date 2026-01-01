/**
 * Gemini プロンプト生成ツール
 * Semantic Scholar API を使用して論文を検索し、
 * EBMに基づいたプロンプトを生成します
 * 日本語→英語翻訳、英語→日本語翻訳機能付き
 */

// ===== State =====
let currentPapers = [];
let translatedPapers = []; // 翻訳済みデータを保持

// ===== DOM Elements =====
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const limitInput = document.getElementById('limitInput');
const loading = document.getElementById('loading');
const resultsSection = document.getElementById('resultsSection');
const resultCount = document.getElementById('resultCount');
const papersList = document.getElementById('papersList');
const promptModal = document.getElementById('promptModal');
const closeModal = document.getElementById('closeModal');
const evidenceBadge = document.getElementById('evidenceBadge');
const promptText = document.getElementById('promptText');
const copyBtn = document.getElementById('copyBtn');
const copyAndOpenBtn = document.getElementById('copyAndOpenBtn');
const toast = document.getElementById('toast');

// ===== Translation Cache =====
const translationCache = new Map();

// ===== Medical Terminology Dictionary (Japanese → English) =====
const MEDICAL_DICTIONARY = {
    // 基礎医学
    'オートファジー': 'autophagy',
    '細胞死': 'cell death',
    'アポトーシス': 'apoptosis',
    '炎症': 'inflammation',
    '免疫': 'immunity',
    '抗体': 'antibody',
    '抗原': 'antigen',
    '遺伝子': 'gene',
    'タンパク質': 'protein',
    '酵素': 'enzyme',
    'ホルモン': 'hormone',
    '代謝': 'metabolism',
    '酸化ストレス': 'oxidative stress',
    '腸内細菌': 'gut microbiome',
    'マイクロバイオーム': 'microbiome',

    // 疾患名
    '糖尿病': 'diabetes',
    '高血圧': 'hypertension',
    '心不全': 'heart failure',
    '脳卒中': 'stroke',
    '心筋梗塞': 'myocardial infarction',
    'がん': 'cancer',
    '癌': 'cancer',
    '認知症': 'dementia',
    'アルツハイマー': 'alzheimer',
    'パーキンソン': 'parkinson',
    'うつ病': 'depression',
    '不安障害': 'anxiety disorder',
    '双極性障害': 'bipolar disorder',
    '統合失調症': 'schizophrenia',
    '不眠症': 'insomnia',
    '睡眠障害': 'sleep disorder',
    '肥満': 'obesity',
    '脂肪肝': 'fatty liver',
    '腎臓病': 'kidney disease',
    '肝臓病': 'liver disease',
    '喘息': 'asthma',
    'アレルギー': 'allergy',
    '花粉症': 'allergic rhinitis',
    'インフルエンザ': 'influenza',
    '新型コロナ': 'COVID-19',
    'コロナ': 'COVID-19',

    // 症状
    '疲労': 'fatigue',
    '倦怠感': 'fatigue',
    '頭痛': 'headache',
    '腹痛': 'abdominal pain',
    '吐き気': 'nausea',
    'めまい': 'dizziness',
    '動悸': 'palpitation',
    '息切れ': 'shortness of breath',
    '浮腫': 'edema',
    'むくみ': 'edema',
    '発熱': 'fever',
    '咳': 'cough',

    // 治療・薬
    '抗生物質': 'antibiotics',
    '抗うつ薬': 'antidepressant',
    '睡眠薬': 'sleeping pill',
    '鎮痛剤': 'analgesic',
    'ワクチン': 'vaccine',
    '副作用': 'side effect',
    '薬物相互作用': 'drug interaction',

    // 研究用語
    'メタ解析': 'meta-analysis',
    'メタアナリシス': 'meta-analysis',
    'システマティックレビュー': 'systematic review',
    'ランダム化比較試験': 'randomized controlled trial',
    'コホート研究': 'cohort study',
    '症例対照研究': 'case-control study',
    'プラセボ': 'placebo',

    // 生活習慣
    '睡眠': 'sleep',
    '運動': 'exercise',
    '食事': 'diet',
    '栄養': 'nutrition',
    'ストレス': 'stress',
    '禁煙': 'smoking cessation',
    '断食': 'fasting',
    '間欠的断食': 'intermittent fasting'
};

// ===== Evidence Level Configuration =====
const EVIDENCE_LEVELS = {
    lv1: {
        lv: 'Lv.1',
        label: 'SR/メタアナリシス',
        verb: '〜と示されている',
        color: '#dc2626',
        keywords: ['systematic review', 'meta-analysis', 'meta analysis', 'cochrane', 'prisma']
    },
    lv2: {
        lv: 'Lv.2',
        label: 'RCT',
        verb: '〜と報告されている',
        color: '#ea580c',
        keywords: ['randomized controlled trial', 'randomised controlled trial', 'rct', 'randomized trial', 'double-blind', 'placebo-controlled']
    },
    lv3: {
        lv: 'Lv.3',
        label: '非RCT比較試験',
        verb: '〜と報告されている',
        color: '#d97706',
        keywords: ['controlled trial', 'comparative study', 'quasi-experimental', 'non-randomized']
    },
    lv4: {
        lv: 'Lv.4',
        label: 'コホート/症例対照',
        verb: '〜と考えられている',
        color: '#65a30d',
        keywords: ['cohort', 'case-control', 'case control', 'prospective study', 'retrospective study', 'longitudinal', 'observational']
    },
    lv5: {
        lv: 'Lv.5',
        label: '症例報告/症例集積',
        verb: '〜との報告がある',
        color: '#0891b2',
        keywords: ['case report', 'case series', 'case study', 'clinical observation']
    },
    lv6: {
        lv: 'Lv.6',
        label: '基礎研究/総説',
        verb: '〜と推察される',
        color: '#6366f1',
        keywords: ['review', 'editorial', 'opinion', 'commentary', 'in vitro', 'in vivo', 'animal study', 'cell line']
    }
};

// ===== Translation Functions =====

/**
 * 日本語かどうかを判定
 */
function isJapanese(text) {
    return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text);
}

/**
 * MyMemory API を使用して翻訳
 */
async function translateText(text, fromLang, toLang) {
    if (!text || text.trim() === '') return text;

    const cacheKey = `${text}_${fromLang}_${toLang}`;
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.substring(0, 500))}&langpair=${fromLang}|${toLang}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.responseStatus === 200 && data.responseData.translatedText) {
            const translated = data.responseData.translatedText;
            translationCache.set(cacheKey, translated);
            return translated;
        }
        return text;
    } catch (error) {
        console.error('Translation error:', error);
        return text;
    }
}

/**
 * 日本語→英語に翻訳（検索用）
 * 医学用語辞書を優先的に使用
 */
async function translateToEnglish(japaneseText) {
    // 辞書に完全一致があればそれを使用
    if (MEDICAL_DICTIONARY[japaneseText]) {
        return MEDICAL_DICTIONARY[japaneseText];
    }

    // 辞書の用語を含む場合は置換
    let translatedText = japaneseText;
    for (const [ja, en] of Object.entries(MEDICAL_DICTIONARY)) {
        if (translatedText.includes(ja)) {
            translatedText = translatedText.replace(new RegExp(ja, 'g'), en);
        }
    }

    // 日本語が残っている場合のみAPIで翻訳
    if (isJapanese(translatedText)) {
        return await translateText(translatedText, 'ja', 'en');
    }

    return translatedText;
}

/**
 * 英語→日本語に翻訳（表示用）
 */
async function translateToJapanese(englishText) {
    return await translateText(englishText, 'en', 'ja');
}

// ===== Functions =====

function getEvidenceLevel(paper) {
    const title = (paper.title || '').toLowerCase();
    const abstract = (paper.abstract || '').toLowerCase();
    const venue = (paper.venue || '').toLowerCase();
    const publicationType = (paper.publicationTypes || []).map(t => t.toLowerCase());

    const searchText = `${title} ${abstract} ${venue} ${publicationType.join(' ')}`;

    for (const [key, config] of Object.entries(EVIDENCE_LEVELS)) {
        for (const keyword of config.keywords) {
            if (searchText.includes(keyword)) {
                return { ...config, key };
            }
        }
    }

    return { ...EVIDENCE_LEVELS.lv6, key: 'lv6' };
}

async function searchPapers(query, limit = 10) {
    const baseUrl = 'https://api.semanticscholar.org/graph/v1/paper/search';
    const fields = 'title,abstract,year,authors,venue,externalIds,publicationTypes,citationCount';

    const url = `${baseUrl}?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error('Search error:', error);
        throw error;
    }
}

/**
 * 論文カードのHTMLを生成（翻訳済みデータを使用）
 */
function createPaperCard(paper, translatedPaper, index) {
    const info = getEvidenceLevel(paper);
    const pmid = paper.externalIds?.PubMed || null;
    const doi = paper.externalIds?.DOI || null;
    const year = paper.year || '年不明';
    const authors = paper.authors?.slice(0, 3).map(a => a.name).join(', ') || '著者不明';
    const citations = paper.citationCount || 0;

    // 翻訳済みのタイトルと抄録を使用
    const displayTitle = translatedPaper.titleJa || paper.title;
    const displayAbstract = translatedPaper.abstractJa || paper.abstract || '抄録なし';

    return `
        <div class="paper-card" data-index="${index}">
            <div class="paper-header">
                <h3 class="paper-title">${displayTitle}</h3>
                <span class="evidence-tag ${info.key}">${info.lv} ${info.label}</span>
            </div>
            <div class="paper-meta">
                <span>📅 ${year}</span>
                <span>👤 ${authors}${paper.authors?.length > 3 ? ' ほか' : ''}</span>
                <span>📊 被引用: ${citations}</span>
                ${pmid ? `<span>PMID: ${pmid}</span>` : ''}
            </div>
            <p class="paper-abstract">${displayAbstract}</p>
            <details class="original-text">
                <summary>📄 原文（英語）</summary>
                <p><strong>Title:</strong> ${paper.title}</p>
                <p><strong>Abstract:</strong> ${paper.abstract || 'N/A'}</p>
            </details>
            <div class="paper-actions">
                <button class="btn-primary" onclick="openPrompt(${index})">
                    <span class="btn-icon">✨</span>
                    プロンプト生成
                </button>
                ${pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/" target="_blank" class="btn-primary" style="text-decoration:none;">
                    <span class="btn-icon">🔗</span>
                    PubMed
                </a>` : ''}
            </div>
        </div>
    `;
}

/**
 * 検索を実行（翻訳機能付き）
 */
async function performSearch() {
    let query = searchInput.value.trim();
    if (!query) {
        showToast('検索キーワードを入力してください');
        return;
    }

    const limit = parseInt(limitInput.value) || 10;

    // UI更新
    loading.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    searchBtn.disabled = true;

    try {
        // 日本語の場合は英語に翻訳
        let searchQuery = query;
        if (isJapanese(query)) {
            showToast('日本語→英語に翻訳中...');
            searchQuery = await translateToEnglish(query);
            console.log(`Translated query: ${query} → ${searchQuery}`);
        }

        currentPapers = await searchPapers(searchQuery, limit);

        if (currentPapers.length === 0) {
            papersList.innerHTML = '<p style="text-align:center;color:var(--text-muted);">該当する論文が見つかりませんでした</p>';
            translatedPapers = [];
        } else {
            // 論文タイトルと抄録を日本語に翻訳
            showToast('検索結果を日本語に翻訳中...');
            translatedPapers = await Promise.all(currentPapers.map(async (paper) => {
                const titleJa = await translateToJapanese(paper.title || '');
                const abstractJa = paper.abstract ? await translateToJapanese(paper.abstract.substring(0, 500)) : '';
                return { titleJa, abstractJa };
            }));

            papersList.innerHTML = currentPapers.map((p, i) => createPaperCard(p, translatedPapers[i], i)).join('');
        }

        resultCount.textContent = `(${currentPapers.length}件)`;
        resultsSection.classList.remove('hidden');
        showToast(`${currentPapers.length}件の論文が見つかりました`);

    } catch (error) {
        showToast('検索中にエラーが発生しました: ' + error.message);
    } finally {
        loading.classList.add('hidden');
        searchBtn.disabled = false;
    }
}

function openPrompt(index) {
    const p = currentPapers[index];
    const info = getEvidenceLevel(p);
    const pmid = p.externalIds?.PubMed || 'なし';
    const doi = p.externalIds?.DOI || 'なし';

    const dataForAgent = `
【医学・薬学ライティングAI v2.0：解析開始指示】
以下の主軸エビデンスに基づき、設定済みのワークフロー（Step 3以降）に従って執筆を開始してください。

■ 主軸エビデンス（確定済み）
- 論文題目：${p.title}
- エビデンスレベル：${info.lv} (${info.label})
- PMID / DOI：${pmid} / ${doi}
- 推奨語尾：「${info.verb}」
- 抄録データ：${p.abstract || '抄録なし（PMIDを参照せよ）'}

■ 執筆方針
網羅性よりも、本論文の「${p.title}」における詳細なメカニズムと、日本国内の臨床状況への応用（薬剤師視点）を深く掘り下げてください。
`.trim();

    evidenceBadge.textContent = `${info.lv} ${info.label}`;
    evidenceBadge.style.background = info.color;
    evidenceBadge.style.color = 'white';
    promptText.value = dataForAgent;

    promptModal.classList.remove('hidden');
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
    }
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// ===== Event Listeners =====

searchBtn.addEventListener('click', performSearch);

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

closeModal.addEventListener('click', () => {
    promptModal.classList.add('hidden');
});

promptModal.addEventListener('click', (e) => {
    if (e.target === promptModal) {
        promptModal.classList.add('hidden');
    }
});

copyBtn.addEventListener('click', async () => {
    const success = await copyToClipboard(promptText.value);
    if (success) {
        showToast('クリップボードにコピーしました！');
    } else {
        showToast('コピーに失敗しました');
    }
});

copyAndOpenBtn.addEventListener('click', async () => {
    const success = await copyToClipboard(promptText.value);
    if (success) {
        showToast('コピーしました。Geminiを開きます...');
        setTimeout(() => {
            window.open('https://gemini.google.com/', '_blank');
            promptModal.classList.add('hidden');
        }, 800);
    } else {
        showToast('コピーに失敗しました');
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !promptModal.classList.contains('hidden')) {
        promptModal.classList.add('hidden');
    }
});
