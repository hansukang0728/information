package kr.nearby.app

import android.content.res.Resources
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path

/** 지도 마커 이미지를 코드로 그립니다 (별도 PNG 없이). */
object MarkerBitmaps {

    /** 물방울 모양 핀. 아래 끝이 좌표를 가리킵니다. */
    fun pin(resources: Resources, color: Int, sizeDp: Float = 28f): Bitmap {
        val density = resources.displayMetrics.density
        val width = (sizeDp * density).toInt()
        val height = (sizeDp * 1.35f * density).toInt()
        val r = width / 2f

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }

        val tail = Path().apply {
            moveTo(r - r * 0.75f, r + r * 0.65f)
            lineTo(r + r * 0.75f, r + r * 0.65f)
            lineTo(r, height.toFloat())
            close()
        }
        canvas.drawPath(tail, paint)
        canvas.drawCircle(r, r, r, paint)

        paint.color = Color.WHITE
        canvas.drawCircle(r, r, r * 0.4f, paint)
        return bitmap
    }

    /** 내 위치: 흰 테두리가 있는 파란 점 */
    fun myLocation(resources: Resources, color: Int, sizeDp: Float = 20f): Bitmap {
        val size = (sizeDp * resources.displayMetrics.density).toInt()
        val r = size / 2f

        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        paint.color = Color.WHITE
        canvas.drawCircle(r, r, r, paint)
        paint.color = color
        canvas.drawCircle(r, r, r * 0.7f, paint)
        return bitmap
    }
}
