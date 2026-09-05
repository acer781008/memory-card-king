翻牌記憶王 V1.0 正式測試版

本機測試：
1. 安裝 Node.js
2. 在此資料夾開啟命令提示字元
3. npm install
4. npm start
5. 主控：http://localhost:3000/admin-login.html
6. 玩家：http://localhost:3000/player.html

本機主控預設密碼：1234

架構：玩家翻牌盤在各自瀏覽器處理；Socket.IO 只同步房間、開始、分數、完成時間與排行榜。
