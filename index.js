

const express = require('express');
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

app.use(express.json());

// LINEとOpenAIの設定
require('dotenv').config();

const CHANNEL_SECRET = process.env.CHANNEL_SECRET;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// `storeInfo.json`の読み込み
let storeInfo = {};
try {
    // JSONファイルを読み込む
    storeInfo = JSON.parse(fs.readFileSync('storeInfo.json', 'utf-8'));

    // menuプロパティが存在するか確認
    if (!Array.isArray(storeInfo.menu)) {
        console.error("Error: 'menu' is missing or invalid in storeInfo.json");
        storeInfo.menu = []; // デフォルト値を設定
    }
} catch (error) {
    console.error("Failed to read or parse storeInfo.json:", error.message);
    storeInfo = { menu: [] }; // デフォルト値を設定
}

// menuDescriptions を生成（menuが空でも安全に処理）
const menuDescriptions = storeInfo.menu.length
    ? storeInfo.menu.map(item => `${item.name} (${item.price}円)`).join(', ')
    : "メニュー情報がありません。";

console.log("Menu Descriptions:", menuDescriptions);

// LINEリクエスト署名の検証
function validateSignature(req) {
    const body = JSON.stringify(req.body);
    const signature = crypto.createHmac('sha256', CHANNEL_SECRET).update(body).digest('base64');
    return req.headers['x-line-signature'] === signature;
}

// ChatGPTからの応答を取得
async function getChatGPTResponse(userMessage) {
    const systemMessage = `
        あなたは「高菜先生の64スマブラ部」のサポート担当AIです。
以下のルールに従い、お客様に適切な回答を提供してください。
1. 必ず「storeInfo」データを参照し、正確で詳細な情報を回答に含めてください。
2. 予約や利用について、基本的に「お断りしない」姿勢で対応してください。困難な場合でも「可能な限り対応いたします」「ご相談ください」とお答えください。
3. 予約案内時に電話番号をLINEで送らないでください。団体の問い合わせに限る。
4. ネガティブな表現（例: 「できません」「無理です」など）は使用せず、必ずポジティブかつ前向きな表現を使用してください。
5. 【予約リクエストフォーム】という文言で予約情報の返信があった場合には駐車場の案内を送ってください。
6. 店舗の特長、体験内容、メニュー、FAQ、ポリシーについては、storeInfo.json の内容を参照して正確に回答してください。
7. 必要に応じてプランの詳細、料金、年齢制限なども回答に含めてください。
8. 質問が曖昧な場合でも、storeInfo 内の関連情報を検索し、適切な回答を試みてください。
9. お客様が迷わないよう、地図やアクセス情報など具体的なサポート情報を含めてください。
10. 回答のトーンは常に丁寧かつ親切にし、「～です」「～ます」調で終わるようにしてください。
12. 子供も参加可能ですので断らない。
13. 最小遂行人数は1人からです。
15. 食事に提供もできます。
22. 食べ放題はやってません。
23. 高菜先生とはSNSでも人気の当店の看板猫でお問い合わせされる可能性があります。高菜先生は河口湖のアトリエ高菜先生にいて会うことができます。
24. 「～ですよ」とか「～ますよ」と言わない。
27. 不定期開催の日曜日についてはHPまたはSNSのお知らせを確認してください。
32. 予約済みのお客様からキャンセルしたいと連絡が来た場合はそのまま承ってください。
34. 団体の体験は最大40名まで受け付けております。
35. 「申し訳ございません」を言わない。
39. 猫またはアトリエ高菜先生に関する問い合わせがあった場合はこのHPを送信してください。https://rentalspace.lp-web.net/
42. 予約完了後は最低限のあいさつにとどめる。
43. アクセスを聞かれたら〒400-0867 山梨県甲府市青沼３丁目５−４４を送る。
44. 店舗がある施設には駐車場があります。
48. 15名以上の問い合わせの際は団体と定義します。
55. 二郎系うどんは850円です。
56. 吉田のうどんは650円です。
57．HPはこのURLです。https://gennarikun.github.io/takana_sumabura/
58. 遅刻、遅れると予約済みのお客様から連絡が来た場合は「かしこまりました。気を付けてお越しくださいませ。」と返信。
59. 「子供だけ参加させたい」と言われたら高校生以上に限ることと、中学生以下は保護者同伴でと伝えてください。
60. ゲームに参加しなくてもいいが、会費は頂く。
61. 了解しましたは使わない。承りましたやかしこまりましたのように丁寧に返答。
64．1000円の参加費がかかります。
66．情報を発信しているSNSはInstagramです。ＵＲＬはhttps://www.instagram.com/takana_sumabura
72.河口湖店の問い合わせや予約があった場合管轄が違うので【担当者から後ほど返信いたします】と回答してください。
73.今夜予約できますか？など当日予約も断らないでください。
74.交流会は毎週土曜部に開催しており、日曜日は不定期で開催しています。平日はやっていません。時間は18時～21時です。
75．予約したいと言われたら以下メッセージを正確にすべて送って。【予約リクエストフォーム】※上記タイトルは消さずに送信してください。消すと正常な返答がされません。\n\nお名前：\n電話番号：\n人数：\n備考：\n日時：※時間も記入してください
`;

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: userMessage }
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${OPENAI_API_KEY}`
                }
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error with ChatGPT:', error.response?.data || error.message);
        return '申し訳ありませんが、現在システムに問題が発生しています。';
    }
}

// LINE返信の送信
async function replyToLine(replyToken, messages) {
    const url = 'https://api.line.me/v2/bot/message/reply';
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
    };

    const body = {
        replyToken: replyToken,
        messages: Array.isArray(messages) ? messages : [{ type: 'text', text: messages }]
    };

    try {
        await axios.post(url, body, { headers });
        console.log('Reply sent successfully');
    } catch (error) {
        console.error('Error replying to LINE:', error.message);
    }
}


// メッセージが予約問い合わせフォームかどうかを判定する関数
function isReservationRequest(message) {
    if (!message) return false; // メッセージが空の場合は false を返す
    return message.includes("【予約リクエストフォーム】");
}
// 1. 固定返信リスト

const fixedResponses = [
  {
    keywords: ["見学", "子供だけ", "保護者なし", "付き添いのみ", "参加しない"],
    response: "当店では見学は可能ですが、見学時のお席のご利用はお断りしております。何か注文していただく必要がございます。"
  },
  {
    keywords: ["3歳", "幼児", "赤ちゃん", "小さい子", "ベビー", "未就学児"],
    response: "体験は3歳以上から参加可能ですが保護者と一緒にご参加いただく必要がございます。"
  },
  {
    keywords: ["1人", "一人", "ひとり", "ソロ", "一名"],
    response: "全ての体験は1名様からご参加いただけます。お気軽にお申し込みください。"
  },
  {
    keywords: ["猫", "ネコ", "高菜先生", "キャット", "にゃんこ"],
    response: "猫は当店にはおりませんが、河口湖の姉妹店「アトリエ高菜先生」で看板猫たちに会えます。 https://rentalspace.lp-web.net/"
  },
  {
    keywords: ["団体", "大人数", "修学旅行", "15名", "バス"],
    response: "15名以上の団体様には担当者が後ほど返信いたします。少々お待ちくださいませ。"
  },
  {
    keywords: ["食べ放題", "バイキング", "ビュッフェ"],
    response: "当店では食べ放題メニューはございません。"
  },

];

// 2. 判定関数
function detectFixedResponse(userMessage) {
  const lower = userMessage.toLowerCase();
  for (const item of fixedResponses) {
    if (item.keywords.some(word => lower.includes(word))) {
      return item.response;
    }
  }
  return null;
}

// サーバー起動確認用ルート
app.get('/', (req, res) => {
    res.send('LINE Bot server is running!');
});

// Webhookエンドポイント
app.post('/webhook', async (req, res) => {
    console.log('Webhook triggered'); // Webhookが呼ばれたログ
    console.log('Received body:', JSON.stringify(req.body, null, 2)); // 受け取ったリクエスト全体


    if (!req.body || !req.body.events || req.body.events.length === 0) {
        console.error('Invalid request body or no events found.');
        return res.status(400).send('Bad Request');
    }

    // 即時レスポンス
    res.status(200).send('OK');

    const events = req.body.events;

    for (const event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
            const userMessage = event.message.text.trim();
            const replyToken = event.replyToken; // replyToken を適切に取得
            console.log('User message:', userMessage); // ユーザーからのメッセージ内容
if (userMessage.toLowerCase().includes("山中湖")) {
  const reply = "山中湖店は移転いたしました。現在は河口湖店のみ営業しております。\n住所：〒401-0301 山梨県南都留郡富士河口湖町船津3376-3";
  await replyToLine(replyToken, reply);
  return; // 強制終了。他の処理は通さない
}
            // 予約リクエストフォームが含まれている場合
            if (isReservationRequest(userMessage)) {
                console.log("Detected reservation request, skipping additional form message.");

              
                // メッセージリストを作成
                const messages = [
                    {
                        type: 'text',
                        text: "ご予約ありがとうございます。\nこちらでご予約承ります\n\nお客様にお伺いしたいことなどで後ほどご連絡させていただく場合がございます。ご了承ください。\n\n※当日遅れるお客様へ\n\n渋滞などで10分以内の遅刻の場合は連絡は不要ですのでそのままお越しください。\n\n🚙お車でお越しのお客様へ。\n\n施設の駐車場をお使いくださいませ。"
                    },
                   
                  
                ];

                // LINEにメッセージを送信
                await replyToLine(replyToken, messages);
                continue; // ChatGPTや追加メッセージの送信をスキップ
            }
          // 朝一予約の判定関数
function detectMorningRequest(userMessage) {
  const morningKeywords = ["朝一", "朝イチ", "一番早い", "朝予約", "朝から", "早朝", "朝の時間"];
  const lower = userMessage.toLowerCase();
  return morningKeywords.some(word => lower.includes(word));
}
// 固定返信パターンの定義
function getFixedResponse(messageText) {
  const lowered = messageText.toLowerCase();

  return null; // 該当なし
}


    // 📍ここから追記（朝一ワード検知）
    if (detectMorningRequest(userMessage)) {
      const morningMsg = "ご予約ありがとうございます！\n\n当店のご予約可能な開始時間は以下の通りです：\n\n・10時00分〜受付開始\n\nお好きな時間をお知らせくださいませ。";
      await replyToLine(replyToken, morningMsg);
      continue;
    }

            // ChatGPTへのリクエスト
            try {
                console.log('Sending to ChatGPT:', userMessage);
                const chatGPTResponse = await getChatGPTResponse(userMessage);
                console.log('ChatGPT Response:', chatGPTResponse);

                // ChatGPTの回答を送信 + 予約フォームを送信
                await replyToLine(replyToken, [
                    { type: 'text', text: chatGPTResponse },

                ]);
            } catch (error) {
                console.error('Error during ChatGPT processing:', error.message);
                await replyToLine(replyToken, "システムに問題が発生しました。再度お試しください。");
            }
        }
    }
});

// LINEへの返信を送信する関数
async function replyToLine(replyToken, message) {
    const url = 'https://api.line.me/v2/bot/message/reply';
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
    };
    const body = {
        replyToken: replyToken,
        messages: Array.isArray(message) ? message : [{ type: 'text', text: message }]
    };

    try {
        console.log('LINE API Request Body:', JSON.stringify(body, null, 2)); // 送信内容
        await axios.post(url, body, { headers });
        console.log('Reply sent successfully');
    } catch (error) {
        console.error('Error replying to LINE:', error.message);
    }
}

// 予約リクエスト判定関数
function isReservationRequest(message) {
    return message.includes("【予約リクエストフォーム】");
}

// サーバー起動

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
