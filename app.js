/**
 * Gemini プロンプト生成ツール
 * Semantic Scholar API を使用して論文を検索し、
 * EBMに基づいたプロンプトを生成します
 */

// ===== State =====
let currentPapers = [];

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

// ===== Evidence Level Configuration =====
const EVIDENCE_LEVELS = {
    // レベル1: システマティックレビュー・メタアナリシス
    lv1: {
        lv: 'Lv.1',
        label: 'SR/メタアナリシス',
        verb: '〜と示されている',
        color: '#dc2626',
        keywords: ['systematic review', 'meta-analysis', 'meta analysis', 'cochrane', 'prisma']
    },
    // レベル2: RCT
    lv2: {
        lv: 'Lv.2',
        label: 'RCT',
        verb: '〜と報告されている',
        color: '#ea580c',
        keywords: ['randomized controlled trial', 'randomised controlled trial', 'rct', 'randomized trial', 'double-blind', 'placebo-controlled']
    },
    // レベル3: 非ランダム化比較試験
    lv3: {
        lv: 'Lv.3',
        label: '非RCT比較試験',
        verb: '〜と報告されている',
        color: '#d97706',
        keywords: ['controlled trial', 'comparative study', 'quasi-experimental', 'non-randomized']
    },
    // レベル4: コホート・ケースコントロール
    lv4: {
        lv: 'Lv.4',
        label: 'コホート/症例対照',
        verb: '〜と考えられている',
        color: '#65a30d',
        keywords: ['cohort', 'case-control', 'case control', 'prospective study', 'retrospective study', 'longitudinal', 'observational']
    },
    // レベル5: 症例報告・症例集積
    lv5: {
        lv: 'Lv.5',
        label: '症例報告/症例集積',
        verb: '〜との報告がある',
        color: '#0891b2',
        keywords: ['case report', 'case series', 'case study', 'clinical observation']
    },
    // レベル6: 専門家意見・基礎研究
    lv6: {
        lv: 'Lv.6',
        label: '基礎研究/総説',
        verb: '〜と推察される',
        color: '#6366f1',
        keywords: ['review', 'editorial', 'opinion', 'commentary', 'in vitro', 'in vivo', 'animal study', 'cell line']
    }
};

// ===== Functions =====

/**
 * 論文情報からエビデンスレベルを判定
 */
function getEvidenceLevel(paper) {
    const title = (paper.title || '').toLowerCase();
    const abstract = (paper.abstract || '').toLowerCase();
    const venue = (paper.venue || '').toLowerCase();
    const publicationType = (paper.publicationTypes || []).map(t => t.toLowerCase());

    // 結合したテキストで検索
    const searchText = `${title} ${abstract} ${venue} ${publicationType.join(' ')}`;

    // 高いレベルから順にチェック
    for (const [key, config] of Object.entries(EVIDENCE_LEVELS)) {
        for (const keyword of config.keywords) {
            if (searchText.includes(keyword)) {
                return { ...config, key };
            }
        }
    }

    // デフォルトはレベル6
    return { ...EVIDENCE_LEVELS.lv6, key: 'lv6' };
}

/**
 * Semantic Scholar API で論文を検索
 */
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
 * 論文カードのHTMLを生成
 */
function createPaperCard(paper, index) {
    const info = getEvidenceLevel(paper);
    const pmid = paper.externalIds?.PubMed || null;
    const doi = paper.externalIds?.DOI || null;
    const year = paper.year || '年不明';
    const authors = paper.authors?.slice(0, 3).map(a => a.name).join(', ') || '著者不明';
    const citations = paper.citationCount || 0;

    return `
        <div class="paper-card" data-index="${index}">
            <div class="paper-header">
                <h3 class="paper-title">${paper.title}</h3>
                <span class="evidence-tag ${info.key}">${info.lv} ${info.label}</span>
            </div>
            <div class="paper-meta">
                <span>📅 ${year}</span>
                <span>👤 ${authors}${paper.authors?.length > 3 ? ' ほか' : ''}</span>
                <span>📊 被引用: ${citations}</span>
                ${pmid ? `<span>PMID: ${pmid}</span>` : ''}
            </div>
            <p class="paper-abstract">${paper.abstract || '抄録なし'}</p>
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
 * 検索を実行
 */
async function performSearch() {
    const query = searchInput.value.trim();
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
        currentPapers = await searchPapers(query, limit);

        if (currentPapers.length === 0) {
            papersList.innerHTML = '<p style="text-align:center;color:var(--text-muted);">該当する論文が見つかりませんでした</p>';
        } else {
            papersList.innerHTML = currentPapers.map((p, i) => createPaperCard(p, i)).join('');
        }

        resultCount.textContent = `(${currentPapers.length}件)`;
        resultsSection.classList.remove('hidden');

    } catch (error) {
        showToast('検索中にエラーが発生しました: ' + error.message);
    } finally {
        loading.classList.add('hidden');
        searchBtn.disabled = false;
    }
}

/**
 * プロンプトを生成してモーダルを開く
 */
function openPrompt(index) {
    const p = currentPapers[index];
    const info = getEvidenceLevel(p);
    const pmid = p.externalIds?.PubMed || 'なし';
    const doi = p.externalIds?.DOI || 'なし';

    // Felo Agent用プロンプト
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

    // モーダル更新
    evidenceBadge.textContent = `${info.lv} ${info.label}`;
    evidenceBadge.style.background = info.color;
    evidenceBadge.style.color = 'white';
    promptText.value = dataForAgent;

    // モーダル表示
    promptModal.classList.remove('hidden');
}

/**
 * クリップボードにコピー
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        // フォールバック
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

/**
 * トースト通知を表示
 */
function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// ===== Event Listeners =====

// 検索ボタン
searchBtn.addEventListener('click', performSearch);

// Enterキーで検索
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

// モーダルを閉じる
closeModal.addEventListener('click', () => {
    promptModal.classList.add('hidden');
});

// モーダル外クリックで閉じる
promptModal.addEventListener('click', (e) => {
    if (e.target === promptModal) {
        promptModal.classList.add('hidden');
    }
});

// コピーボタン
copyBtn.addEventListener('click', async () => {
    const success = await copyToClipboard(promptText.value);
    if (success) {
        showToast('クリップボードにコピーしました！');
    } else {
        showToast('コピーに失敗しました');
    }
});

// コピー＆Gemini起動
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

// ESCキーでモーダルを閉じる
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !promptModal.classList.contains('hidden')) {
        promptModal.classList.add('hidden');
    }
});

