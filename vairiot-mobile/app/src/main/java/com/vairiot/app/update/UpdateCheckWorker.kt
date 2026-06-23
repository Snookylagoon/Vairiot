package com.vairiot.app.update

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

private const val TAG = "UpdateCheckWorker"

@HiltWorker
class UpdateCheckWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val checker: UpdateChecker,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = try {
        val triggered = checker.checkAndInstall()
        Log.i(TAG, "update check complete (installed=$triggered)")
        Result.success()
    } catch (e: Exception) {
        Log.w(TAG, "update check failed: ${e.message}")
        Result.retry()
    }
}
