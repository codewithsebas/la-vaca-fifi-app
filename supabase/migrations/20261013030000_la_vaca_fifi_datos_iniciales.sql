-- La Vaca Fifí: descripción y características de las cabañas (se editan después desde el panel: Cabañas).
update public.cabin_types set
  descripcion = 'Cabaña con cama doble, baño privado con ducha de agua caliente y balcón con vista a las montañas de Murillo. Para descansar en pareja, con el desayuno americano incluido.',
  caracteristicas = array['Cama doble', 'Baño privado con agua caliente', 'Balcón con vista a la montaña', 'TV de pantalla plana', 'Wifi', 'Desayuno americano']
where id = 'doble';

update public.cabin_types set
  descripcion = 'Dos camas dobles para venir con amigos o en familia. Baño privado con agua caliente, TV de pantalla plana y balcón para tomarse el café mirando la montaña.',
  caracteristicas = array['Dos camas dobles', 'Baño privado con agua caliente', 'Balcón con vista a la montaña', 'TV de pantalla plana', 'Wifi', 'Desayuno americano']
where id = 'dos-camas';

update public.cabin_types set
  descripcion = 'La más amplia: cama doble y camarote, para que los niños tengan su propio rincón. Baño privado, TV y balcón, a pocos pasos del parque infantil y del restaurante.',
  caracteristicas = array['Cama doble y camarote', 'Baño privado con agua caliente', 'Balcón', 'TV de pantalla plana', 'Wifi', 'Desayuno americano']
where id = 'familiar';

update public.cabin_types set
  descripcion = 'Cama doble y camarote, con el balcón de frente a las montañas y los potreros de la vereda. Baño privado con agua caliente y desayuno americano incluido.',
  caracteristicas = array['Cama doble y camarote', 'Balcón con vista a la montaña', 'Baño privado con agua caliente', 'TV de pantalla plana', 'Wifi', 'Desayuno americano']
where id = 'familiar-vista';
