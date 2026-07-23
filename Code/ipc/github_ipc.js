const { ipcMain, shell } = require('electron');
const https = require('https');
const { saveTree, listTrees, getTree, deleteTree } = require('../database/githubTrees');

// In-memory cache for commit counts: { 'owner/repo': { count, fetchedAt } }
const _commitCountCache = {};
const _COMMIT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function githubApiGet(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'HelperTool/1.0',
        'Accept': 'application/vnd.github.v3+json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    };
    const req = https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('Invalid JSON response')); }
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function parseGithubUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  if (!match) throw new Error('Invalid GitHub URL. Expected: https://github.com/owner/repo');
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

function parseLinkHeader(linkHeader) {
  if (!linkHeader) return {};
  const links = {};
  linkHeader.split(',').forEach(part => {
    const section = part.split(';');
    if (section.length < 2) return;
    const url = section[0].replace(/<(.*)>/, '$1').trim();
    const rel = section[1].replace(/rel="(.*)"/, '$1').trim();
    links[rel] = url;
  });
  return links;
}

function getLastPageFromLink(linkHeader) {
  const links = parseLinkHeader(linkHeader);
  if (!links.last) return null;
  const url = new URL(links.last);
  return parseInt(url.searchParams.get('page')) || null;
}

async function fetchAllPages(path, token) {
  const results = [];
  let currentPath = path;
  while (currentPath) {
    const data = await githubApiGetRaw(currentPath, token);
    if (!data.body || !Array.isArray(data.body)) break;
    results.push(...data.body);
    const links = parseLinkHeader(data.link);
    currentPath = links.next || null;
  }
  return results;
}

function githubApiGetRaw(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'HelperTool/1.0',
        'Accept': 'application/vnd.github.v3+json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    };
    const req = https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve({
              body: JSON.parse(data),
              link: res.headers.link || null,
            });
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function register() {
  ipcMain.handle('github:loadTree', async (event, { url, token }) => {
    try {
      const { owner, repo } = parseGithubUrl(url);

      const repoInfo = await githubApiGet(`/repos/${owner}/${repo}`, token);
      const branch = repoInfo.default_branch;

      const treeData = await githubApiGet(
        `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        token
      );

      const allItems = treeData.tree || [];
      const fileItems = allItems.filter(i => i.type === 'blob');

      return {
        success: true,
        repoName: `${owner}/${repo}`,
        branch,
        description: repoInfo.description || '',
        truncated: !!treeData.truncated,
        tree: allItems,
        totalFiles: fileItems.length,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:saveTree', async (event, data) => {
    try {
      saveTree(data);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:listSaved', async () => {
    try {
      const trees = listTrees();
      return { success: true, trees };
    } catch (err) {
      return { success: false, error: err.message, trees: [] };
    }
  });

  ipcMain.handle('github:loadSaved', async (event, repoUrl) => {
    try {
      const data = getTree(repoUrl);
      if (!data) return { success: false, error: 'Not found in cache' };
      return { success: true, ...data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:deleteSaved', async (event, repoUrl) => {
    try {
      deleteTree(repoUrl);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:listRepos', async (event, { token, type, sort, direction }) => {
    try {
      const t = type || 'all';
      const s = sort === 'commits' ? 'updated' : (sort || 'updated');
      const d = direction || 'desc';
      const repos = await fetchAllPages(`/user/repos?per_page=100&type=${t}&sort=${s}&direction=${d}`, token);
      return {
        success: true,
        repos: repos.map(r => ({
          name: r.name,
          fullName: r.full_name,
          description: r.description || '',
          htmlUrl: r.html_url,
          private: r.private,
          fork: r.fork,
          language: r.language || '',
          pushedAt: r.pushed_at,
          updatedAt: r.updated_at,
          createdAt: r.created_at,
          size: r.size,
          stars: r.stargazers_count,
          defaultBranch: r.default_branch,
        })),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:getCommitCounts', async (event, { token, repos }) => {
    try {
      const now = Date.now();
      const result = {};
      const toFetch = [];

      for (const { owner, name } of repos) {
        const key = `${owner}/${name}`;
        const cached = _commitCountCache[key];
        if (cached && (now - cached.fetchedAt < _COMMIT_CACHE_TTL)) {
          result[key] = cached.count;
        } else {
          toFetch.push({ owner, name, key });
        }
      }

      if (toFetch.length > 0) {
        const fetches = toFetch.map(({ owner, name, key }) =>
          githubApiGetRaw(`/repos/${owner}/${name}/commits?per_page=1&page=1`, token)
            .then(raw => {
              const link = raw.link || null;
              let count = 1;
              if (link) {
                const lastPage = getLastPageFromLink(link);
                if (lastPage !== null) count = lastPage;
              }
              _commitCountCache[key] = { count, fetchedAt: now };
              return { key, count };
            })
            .catch(() => ({ key, count: 0 }))
        );

        const settled = await Promise.allSettled(fetches);
        for (const s of settled) {
          if (s.status === 'fulfilled' && s.value) {
            result[s.value.key] = s.value.count;
          }
        }
      }

      return { success: true, counts: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('github:openUrl', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
