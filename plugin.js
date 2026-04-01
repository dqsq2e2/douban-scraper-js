// 豆瓣图书刮削插件 (JavaScript 版本)

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': 'https://book.douban.com/'
};

function initialize(context) {
    Ting.log.info('豆瓣刮削插件已加载');
}

function shutdown() {
    Ting.log.info('豆瓣刮削插件已卸载');
}

async function search(args) {
    const query = args.query || '';
    const page = args.page || 1;
    const authorFilter = args.author;
    
    // 豆瓣搜索不需要演播者过滤，因为豆瓣是图书而不是有声书
    Ting.log.info(`搜索豆瓣: ${query}, 页码: ${page}, 作者过滤: ${authorFilter || '无'}`);
    
    const searchUrl = `https://www.douban.com/search?cat=1001&q=${encodeURIComponent(query)}`;
    
    const resp = await fetch(searchUrl, { headers: HEADERS });
    if (!resp.ok) {
        throw new Error(`豆瓣搜索请求失败: ${resp.status}`);
    }
    const html = await resp.text();
    
    let items = [];
    const parts = html.split('<div class="result">');
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        
        // 解析 URL
        const urlMatch = block.match(/href="([^"]+)"/);
        let href = urlMatch ? urlMatch[1] : '';
        if (href.includes('douban.com/link2/')) {
            const uMatch = href.match(/[?&]url=([^&]+)/);
            if (uMatch) href = decodeURIComponent(uMatch[1]);
        }
        const idMatch = href.match(/subject\/(\d+)/);
        if (!idMatch) continue;
        const id = idMatch[1];
        
        // 解析标题
        const titleMatch = block.match(/title="([^"]+)"/);
        let title = titleMatch ? titleMatch[1] : '';
        
        // 解析封面
        const coverMatch = block.match(/<img src="([^"]+)"/);
        let cover_url = coverMatch ? coverMatch[1] : '';
        if (cover_url) {
            cover_url = cover_url.replace('/s/public/', '/l/public/'); // 获取大图
            // 恢复使用 hash 后缀传递 referer 的方式
            cover_url = cover_url + '#referer=https://book.douban.com/';
        }
        
        // 解析作者
        const castMatch = block.match(/<span class="subject-cast">([^<]+)<\/span>/);
        let author = '';
        if (castMatch) {
            // 格式通常是 "作者 / 出版社 / 年份"
            author = castMatch[1].split('/')[0].trim();
        }
        
        items.push({
            id: id,
            title: title,
            author: author,
            cover_url: cover_url,
            intro: '',
            tags: [],
            narrator: null,
            chapter_count: null,
            duration: null
        });
    }
    
    Ting.log.info(`解析到 ${items.length} 个书籍结果`);

    // 作者过滤逻辑
    if (authorFilter && items.length > 0) {
        const normalizedFilter = authorFilter.trim().toLowerCase();
        const index = items.findIndex(item => {
            const authorName = (item.author || '').trim().toLowerCase();
            // 去除作者名字中的括号等干扰字符，例如 "[明]吴承恩 著" -> "吴承恩"
            const cleanAuthor = authorName.replace(/\[.*?\]|\(.*?\)|【.*?】|著|编|绘/g, '').trim();
            return cleanAuthor && (cleanAuthor.includes(normalizedFilter) || normalizedFilter.includes(cleanAuthor));
        });
        
        if (index !== -1 && index !== 0) {
            Ting.log.info(`找到匹配作者的结果: ${items[index].author} (索引: ${index})，将其提升至首位`);
            const selectedItem = items.splice(index, 1)[0];
            items.unshift(selectedItem);
        } else if (index === 0) {
            Ting.log.info(`首位结果作者已匹配: ${items[0].author}`);
        } else {
            Ting.log.info(`未找到匹配作者 "${authorFilter}" 的结果，使用默认排序`);
        }
    }
    
        // 首项增强：获取第一条结果的详细信息（简介、标签）
    if (items.length > 0) {
        try {
            Ting.log.info(`正在获取第一条结果详情: ${items[0].title} (${items[0].id})`);
            const detail = await _fetchDetail(items[0].id);
            Object.assign(items[0], detail);
            Ting.log.info(`增强首项结果成功`);
        } catch (e) {
            Ting.log.warn(`增强首项结果失败: ${e.message}`);
        }
    }
    
    return {
        items: items,
        total: items.length, // 简单起见，使用当前页的结果数
        page: page,
        page_size: items.length
    };
}

async function _fetchDetail(bookId) {
    const detailUrl = `https://book.douban.com/subject/${bookId}/`;
    const resp = await fetch(detailUrl, { headers: HEADERS });
    if (!resp.ok) {
        throw new Error(`书籍详情请求失败: ${resp.status}`);
    }
    const html = await resp.text();
    
    const detail = {};
    
    // 简介
    // 豆瓣的简介如果过长，会分为短版（可见）和长版（隐藏在 <span class="all hidden"> 中）
    const hiddenIntroMatch = html.match(/<span class="all hidden">([\s\S]*?)<\/span>/);
    let rawIntro = '';
    
    if (hiddenIntroMatch) {
        // 如果有隐藏的完整版，优先使用
        const innerIntroMatch = hiddenIntroMatch[1].match(/<div class="intro">([\s\S]*?)<\/div>/);
        rawIntro = innerIntroMatch ? innerIntroMatch[1] : hiddenIntroMatch[1];
    } else {
        // 否则查找普通的 intro
        const introRegex = /<div class="intro">([\s\S]*?)<\/div>/g;
        const introMatches = [...html.matchAll(introRegex)];
        if (introMatches.length > 0) {
            rawIntro = introMatches[0][1];
        }
    }
    
    if (rawIntro) {
        detail.intro = rawIntro.replace(/<br\s*\/?>/gi, '\n')
                               .replace(/<p>/gi, '')
                               .replace(/<\/p>/gi, '\n')
                               .replace(/<[^>]+>/g, '')
                               .trim();
    }
    
    // 标签
    const tags = [];
    const criteriaMatch = html.match(/criteria\s*=\s*'([^']+)'/);
    if (criteriaMatch) {
        const parts = criteriaMatch[1].split('|');
        for (const part of parts) {
            if (part.startsWith('7:')) {
                tags.push(part.replace('7:', ''));
            }
        }
    }
    
    if (tags.length === 0) {
        // Fallback 标签提取
        const tagsBlockRegex = /<a[^>]*class="\s*tag\s*"[^>]*>([\s\S]*?)<\/a>/g;
        let tagMatch;
        while ((tagMatch = tagsBlockRegex.exec(html)) !== null) {
            tags.push(tagMatch[1].trim());
        }
    }
    detail.tags = tags;
    
    return detail;
}

// 导出函数 (必须!)
globalThis.initialize = initialize;
globalThis.shutdown = shutdown;
globalThis.search = search;
