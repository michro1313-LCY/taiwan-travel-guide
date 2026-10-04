# Michael 的台灣旅遊攻略—管理員驗證版

這是可部署到 GitHub Pages 的純前端網站，使用 Firebase Authentication、Cloud Firestore 與 Firebase Storage。只有指定的管理員 UID 可以管理內容；網站程式碼不保存密碼或私密金鑰。

## 已完成的功能

- 管理員電子郵件／密碼登入與登出
- 只有指定 UID 能新增、修改及刪除文章
- 管理員可上傳 JPG、PNG、WebP 圖片（每張上限 10MB）
- 公開訪客可瀏覽已發布文章
- 訪客收藏保存在自己的瀏覽器，不上傳個人資料
- 訪客可送出留言或補充資料，管理員審核後標記處理或刪除
- Firestore 與 Storage 安全規則

## 初次設定

1. 前往 Firebase Console 建立專案，新增 Web App。
2. Authentication → Sign-in method，啟用「電子郵件／密碼」。
3. Authentication → Users，建立您自己的管理員帳號；不要把密碼寫入任何檔案。
4. 複製該帳號的 UID。
5. 建立 Cloud Firestore database 與 Firebase Storage。
6. 將 `firebase-config.example.js` 複製為 `firebase-config.js`，填入 Firebase Web App 設定及管理員 UID。
7. 把 `firestore.rules` 與 `storage.rules` 中的 `REPLACE_WITH_YOUR_FIREBASE_UID` 替換為相同 UID，並在 Firebase Console 發布規則。
8. Authentication → Settings → Authorized domains，加入 `michro1313-lcy.github.io`。
9. 將所有網站檔案推送到 repository 的 `main` 分支，再到 GitHub Settings → Pages，選擇從 `main` 根目錄部署。

Firebase Web App 的 `apiKey` 與專案識別資訊可出現在瀏覽器程式碼中；真正的存取控制由 Authentication 與安全規則執行。絕不可把 Firebase Admin 私鑰、服務帳戶 JSON、GitHub Personal Access Token 或您的密碼提交到 repository。

## 驗證與權杖流程

1. 管理員在瀏覽器輸入電子郵件及密碼。
2. 密碼直接傳送給 Firebase Authentication，網站不會保存密碼。
3. Firebase 驗證成功後簽發短效 ID Token，SDK 保存在瀏覽器本機持久層並自動更新。
4. Firestore／Storage 請求自動帶上 ID Token。
5. 安全規則先驗證 Token，再比對 UID；只有指定 UID 可寫入文章、讀取留言與上傳圖片。
6. 登出時 Firebase 清除本機登入狀態；Token 到期後亦不能繼續使用。

## 正式上線前建議

- 啟用 Firebase App Check，降低機器人濫用匿名留言。
- 管理員帳號使用獨立且高強度密碼，並啟用 Google Cloud 帳戶的多重要素驗證。
- 定期在 Firebase Console 檢查 Authentication 使用者及 Firestore 用量。
