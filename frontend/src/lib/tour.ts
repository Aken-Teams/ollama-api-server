import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

export function startTour() {
  const driverObj = driver({
    showProgress: true,
    animate: true,
    overlayOpacity: 0.5,
    steps: [
      {
        popover: {
          title: '歡迎使用 PJ AI API 管理系統',
          description: '這個導覽將帶您快速了解系統的主要功能。點擊「下一步」開始。',
          side: 'bottom',
          align: 'start',
        }
      },
      {
        element: '#nav-sidebar',
        popover: {
          title: '左側導覽選單',
          description: '左側選單包含所有功能入口：總覽、模型測試、效能比較、OCR 工具、Agent 對話，以及管理員專用的 Key 管理、使用者管理等。',
          side: 'right',
          align: 'start',
        }
      },
      {
        element: '#nav-test',
        popover: {
          title: '模型快速測試',
          description: '在「模型測試」頁面，您可以快速測試各個 AI 模型的回應，並查看每個模型的狀態。',
          side: 'right',
        }
      },
      {
        element: '#btn-tour',
        popover: {
          title: '說明卡功能',
          description: '在模型測試和 Key 管理頁面中，每個模型和 Key 都有「說明卡」按鈕，可以生成給 AI 助理的快速設定卡片。',
          side: 'bottom',
        }
      },
      {
        element: '#nav-keys',
        popover: {
          title: 'API Key 管理',
          description: '管理員可以在這裡管理所有 API Key，包括建立、啟用/停用、重新產生和刪除 Key。',
          side: 'right',
        }
      },
      {
        popover: {
          title: '申請 Key 流程',
          description: '在 Key 管理頁面點擊「新增 Key」按鈕，填寫使用者名稱、說明，選擇可用模型，即可建立新的 API Key 並自動生成說明卡。',
          side: 'bottom',
          align: 'start',
        }
      },
      {
        popover: {
          title: '導覽完成！',
          description: '您已了解 PJ AI API 管理系統的主要功能。如需更多說明，請參考 API 文檔頁面。祝您使用愉快！',
          side: 'bottom',
          align: 'start',
        }
      },
    ],
  })

  driverObj.drive()
}
