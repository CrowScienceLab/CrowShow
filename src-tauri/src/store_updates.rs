use serde::Serialize;
#[derive(Serialize)]
pub struct StoreUpdateStatus {
    available: bool,
    completed: bool,
}

#[tauri::command]
pub async fn store_package_update(
    app: tauri::AppHandle,
    install: bool,
) -> Result<StoreUpdateStatus, String> {
    #[cfg(all(windows, feature = "microsoft-store"))]
    {
        use tauri::Manager;
        let owner = app
            .get_webview_window("main")
            .ok_or("앱 창을 찾을 수 없습니다.")?
            .hwnd()
            .map_err(|e| e.to_string())?
            .0 as usize;
        return tauri::async_runtime::spawn_blocking(move || perform(owner, install))
            .await
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(all(windows, feature = "microsoft-store")))]
    {
        let _ = (app, install);
        Err("Microsoft Store 설치판에서만 사용할 수 있습니다.".into())
    }
}
#[cfg(all(windows, feature = "microsoft-store"))]
fn perform(owner: usize, install: bool) -> Result<StoreUpdateStatus, String> {
    use windows::{
        Services::Store::{StoreContext, StorePackageUpdateState},
        Win32::{
            Foundation::HWND,
            System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize},
            UI::Shell::IInitializeWithWindow,
        },
        core::Interface,
    };
    struct Runtime;
    impl Drop for Runtime {
        fn drop(&mut self) {
            unsafe { RoUninitialize() }
        }
    }
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.map_err(|e| e.to_string())?;
    let _runtime = Runtime;
    let context = StoreContext::GetDefault().map_err(|e| e.to_string())?;
    let owner_context: IInitializeWithWindow = context.cast().map_err(|e| e.to_string())?;
    unsafe { owner_context.Initialize(HWND(owner as *mut _)) }.map_err(|e| e.to_string())?;
    let updates = context
        .GetAppAndOptionalStorePackageUpdatesAsync()
        .and_then(|op| op.join())
        .map_err(|e| e.to_string())?;
    let available = updates.Size().map_err(|e| e.to_string())? > 0;
    if !install || !available {
        return Ok(StoreUpdateStatus {
            available,
            completed: false,
        });
    }
    let result = context
        .RequestDownloadAndInstallStorePackageUpdatesAsync(&updates)
        .and_then(|op| op.join())
        .map_err(|e| e.to_string())?;
    let state = result.OverallState().map_err(|e| e.to_string())?;
    if state != StorePackageUpdateState::Completed {
        return Err(format!(
            "Store 업데이트를 완료하지 못했습니다 ({state:?}). Microsoft Store 라이브러리에서 다시 시도하세요."
        ));
    }
    Ok(StoreUpdateStatus {
        available: true,
        completed: true,
    })
}
