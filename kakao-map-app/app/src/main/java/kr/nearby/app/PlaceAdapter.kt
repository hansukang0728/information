package kr.nearby.app

import android.annotation.SuppressLint
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.view.isVisible
import androidx.recyclerview.widget.RecyclerView
import kr.nearby.app.databinding.ItemPlaceBinding

class PlaceAdapter(
    private val onClick: (index: Int) -> Unit,
    private val onCall: (Place) -> Unit,
    private val onDetail: (Place) -> Unit,
) : RecyclerView.Adapter<PlaceAdapter.Holder>() {

    class Holder(val binding: ItemPlaceBinding) : RecyclerView.ViewHolder(binding.root)

    private var items: List<Place> = emptyList()
    private var selected = RecyclerView.NO_POSITION

    @SuppressLint("NotifyDataSetChanged")
    fun submit(places: List<Place>) {
        items = places
        selected = RecyclerView.NO_POSITION
        notifyDataSetChanged()
    }

    fun setSelected(index: Int) {
        val old = selected
        selected = index
        if (old != RecyclerView.NO_POSITION) notifyItemChanged(old)
        if (index != RecyclerView.NO_POSITION) notifyItemChanged(index)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        Holder(ItemPlaceBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun getItemCount() = items.size

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val place = items[position]
        with(holder.binding) {
            textName.text = place.name
            textMeta.text = listOfNotNull(
                place.shortCategory.ifEmpty { null },
                place.distance?.let(::formatDistance),
            ).joinToString(" · ")
            textAddress.text = place.address
            textAddress.isVisible = place.address.isNotEmpty()

            btnCall.isVisible = place.phone.isNotEmpty()
            btnCall.setOnClickListener { onCall(place) }
            btnDetail.setOnClickListener { onDetail(place) }

            root.isActivated = position == selected
            root.setOnClickListener { onClick(holder.bindingAdapterPosition) }
        }
    }
}
