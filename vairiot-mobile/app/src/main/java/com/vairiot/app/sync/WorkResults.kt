package com.vairiot.app.sync

import android.util.Log
import androidx.work.ListenableWorker

/**
 * Maps a drain to a WorkManager result. A 401 returns success, not retry: the
 * session is gone, so backoff retries would only 401 again. The periodic run
 * and the post-login trigger pick the queue up once a valid token exists.
 */
internal fun DrainReport.toWorkResult(tag: String): ListenableWorker.Result {
    if (synced > 0 || failed > 0 || dead > 0) {
        Log.i(tag, "Sync $outcome: $synced synced, $failed to retry, $dead rejected")
    }
    return when (outcome) {
        DrainOutcome.DONE -> ListenableWorker.Result.success()
        DrainOutcome.RETRY -> ListenableWorker.Result.retry()
        DrainOutcome.PAUSED_AUTH -> {
            Log.i(tag, "Sync paused — session rejected; resumes after sign in")
            ListenableWorker.Result.success()
        }
    }
}
