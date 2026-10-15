using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wunschzettu.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LinkLogo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PreviewLogoKey",
                table: "WishLink",
                type: "TEXT",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "UseLogo",
                table: "WishLink",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PreviewLogoKey",
                table: "WishLink");

            migrationBuilder.DropColumn(
                name: "UseLogo",
                table: "WishLink");
        }
    }
}
