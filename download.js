const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ====== 你的图片数据（从 allItemsData 里摘出来的）======
// 只需要 img 不为空的项
const items = [
  { n: "菠菜", url: "https://ts2.tc.mm.bing.net/th/id/ODL.9b1c571cff74299398e0c193b91b867d?w=310&h=198&c=7&rs=1&bgcl=fffffe&r=0&o=6&dpr=1.1&pid=AlgoBlockDebug" },
  { n: "油麦菜", url: "https://ts2.tc.mm.bing.net/th/id/ODL.3aa3cc9b665a92ac86de68631cb0c4b9?w=310&h=198&c=7&rs=1&bgcl=fffffe&r=0&o=6&dpr=1.1&pid=AlgoBlockDebug" },
  { n: "空心菜", url: "https://ts1.tc.mm.bing.net/th/id/R-C.3cd1dc2e3ad2a7c1be55188fbf45cc9f?rik=3fycjdnw7KsERw&riu=http%3a%2f%2fk.sinaimg.cn%2fn%2ffront%2f112%2fw507h405%2f20190408%2fS5Nc-hvhrcxn0826268.jpg%2fw700d1q75cms.jpg&ehk=m%2f%2bt4t1m4699DiIqz%2fgS8EaoPsxC6PZ6vsyvRSyJRAE%3d&risl=&pid=ImgRaw&r=0" },
  { n: "苋菜", url: "https://bkwikiflow.bj.bcebos.com/loc-index/d5119c775d30a0f96f3f095b09d1265f/cb244cc649da4307a9d3e714c7a28916/1782718395/%E5%B8%B8%E8%A7%81%E8%8B%8B%E7%89%B9%E7%82%B9%E5%8F%8A%E5%8C%BA%E5%88%AB/%E8%8B%8B/%E5%A4%A7%E5%9C%86%E5%8F%B6%E7%BA%A2%E8%8B%8B%E8%8F%9C.webp" },
  { n: "茼蒿", url: "https://bkimg.cdn.bcebos.com/pic/42a98226cffc1e178a8271c56ac7e103738da87743b5?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" },
  { n: "韭菜", url: "https://bkimg.cdn.bcebos.com/pic/c8ea15ce36d3d539b600beda87d1fe50352ac65c1a29?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" },
  { n: "香菜", url: "https://bkimg.cdn.bcebos.com/pic/c9fcc3cec3fdfc03924522626b699094a4c27c1e88e8?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" },
  { n: "小白菜", url: "https://bkimg.cdn.bcebos.com/pic/9f2f070828381f30e924ffb313575b086e061d955a28?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" },
  { n: "黄心大白菜", url: "https://bkwikiflow.bj.bcebos.com/loc-index/36e5c995e8cf1ae7e58a83ec36a74c92/05c35b4637c44ac09f1fbd34c9eae64d/1782728001/%E5%B8%B8%E8%A7%81%E5%B0%8F%E7%99%BD%E8%8F%9C%E7%89%B9%E7%82%B9%E5%8F%8A%E5%8C%BA%E5%88%AB/%E5%B0%8F%E7%99%BD%E8%8F%9C/%E9%BB%84%E5%BF%83%E5%A4%A7%E7%99%BD%E8%8F%9C.webp" },
  { n: "生菜", url: "https://materials.cdn.bcebos.com/images/33497614/78785f68748a241c2ef30ebb171f75eb.jpeg" },
  { n: "芹菜", url: "https://bkimg.cdn.bcebos.com/smart/dcc451da81cb39dbb6fdd89ce74c1e24ab18962b9afd-bkimg-process,v_1,rw_1023,rh_682,maxl_426?x-bce-process=image/format,f_auto" },
  { n: "芥蓝", url: "https://p1.ssl.qhimg.com/t0136a330583126d897.jpg" },
  { n: "菜心", url: "https://pic.nximg.cn/file/20230305/26853825_144601708101_2.jpg" },
  { n: "上海青", url: "https://bkimg.cdn.bcebos.com/pic/aec379310a55b319ebc4332e1df09526cffc1e17b96d?x-bce-process=image/format,f_auto/watermark,image_d2F0ZXIvYmFpa2UyNzI,g_7,xp_5,yp_5,P_20/resize,m_lfit,limit_1,h_1080" },
  { n: "鸡毛菜", url: "https://ts3.tc.mm.bing.net/th/id/ODL.2d316886a223989910783e3303e7f6d3?w=310&h=198&c=7&rs=1&bgcl=fffffe&r=0&o=6&dpr=1.1&pid=AlgoBlockDebug" },
  { n: "木耳菜", url: "https://ts1.tc.mm.bing.net/th/id/OIP-C.-sl0uR5chFHcZD_GIOa3GQHaHa?r=0&rs=1&pid=ImgDetMain&o=7&rm=3" },
  { n: "红薯叶", url: "https://materials.cdn.bcebos.com/images/9080469/0fb8395dd078c1099780c21fe27d69f9.jpeg" },
  { n: "苦苣", url: "https://pic.nximg.cn/file/20230512/29159477_151105055107_2.jpg" },
  { n: "芝麻菜", url: "https://pic2.zhimg.com/v2-0a6868c474171620e7a41c51d621a28a_r.jpg" }
];

// ====== 下载逻辑 ======
const dir = path.join(__dirname, 'img');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

function download(url, filePath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 15000 }, (res) => {
      // 跟随重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, filePath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(filePath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('超时'));
    });
  });
}

// 判断扩展名
function guessExt(url) {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.webp')) return '.webp';
  if (clean.endsWith('.png')) return '.png';
  if (clean.endsWith('.jpeg')) return '.jpg';
  if (clean.endsWith('.jpg')) return '.jpg';
  return '.jpg'; // 默认
}

(async () => {
  console.log(`开始下载 ${items.length} 张图片...\n`);
  const results = { ok: [], fail: [] };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const ext = guessExt(item.url);
    const filePath = path.join(dir, item.n + ext);
    try {
      await download(item.url, filePath);
      const size = fs.statSync(filePath).size;
      console.log(`✓ [${i + 1}/${items.length}] ${item.n} (${(size / 1024).toFixed(1)} KB)`);
      results.ok.push({ n: item.n, ext });
    } catch (e) {
      console.log(`✗ [${i + 1}/${items.length}] ${item.n} 失败：${e.message}`);
      results.fail.push({ n: item.n, reason: e.message });
    }
  }

  console.log('\n========== 下载结果 ==========');
  console.log(`成功 ${results.ok.length} / 失败 ${results.fail.length}`);

  if (results.fail.length) {
    console.log('\n失败清单：');
    results.fail.forEach(f => console.log(`  - ${f.n}: ${f.reason}`));
  }

  // 输出生成好的 img 映射（方便你直接替换数据）
  console.log('\n========== 建议替换的 img 字段 ==========');
  results.ok.forEach(r => {
    console.log(`  { n: "${r.n}", ..., img: "img/${r.n}${r.ext}" },`);
  });
})();