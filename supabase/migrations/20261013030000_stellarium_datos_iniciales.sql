-- Stellarium Glamping: descripción y características de los domos (se editan después desde el panel: Domos).
update public.cabin_types set
  descripcion = 'Domo geodésico con cama king y vista panorámica a las montañas. Afuera, en tu terraza privada, un jacuzzi para ver caer la noche y contar estrellas.',
  caracteristicas = array['Jacuzzi privado', 'Cama king', 'Baño privado con ducha', 'Calefacción', 'Terraza con vista', 'Desayuno']
where id = 'pareja';

update public.cabin_types set
  descripcion = 'Domo geodésico amplio con cama king y cama queen, para venir en familia o con amigos. Terraza privada con jacuzzi y calefacción para las noches frías de la alta montaña.',
  caracteristicas = array['Jacuzzi privado', 'Cama king y cama queen', 'Baño privado con ducha', 'Calefacción', 'Terraza con vista', 'Desayuno']
where id = 'familiar';
